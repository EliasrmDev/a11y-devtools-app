import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import type { NotificationService } from "../../notifications/notification.service.js";
import { deletionRequests } from "../../db/schema/deletion-requests.js";
import { usageEvents } from "../../db/schema/usage-events.js";
import { reminderJobs } from "../../db/schema/reminder-jobs.js";
import { notificationPreferences } from "../../db/schema/notification-preferences.js";
import { sessions } from "../../db/schema/sessions.js";
import { identities } from "../../db/schema/identities.js";
import { aiProviderConnections } from "../../db/schema/ai-provider-connections.js";
import { encryptedSecrets } from "../../db/schema/encrypted-secrets.js";
import { revokedTokens } from "../../db/schema/revoked-tokens.js";
import { users } from "../../db/schema/users.js";
import { sql, eq, and, lte, inArray } from "drizzle-orm";

/**
 * Processes pending deletion requests that have passed their grace period.
 * Deletes data table-by-table, tracking progress in processed_tables JSONB.
 *
 * Also retries requests stuck in "processing" (crashed) or "failed" status.
 */
export async function processDeletionRequests(
  db: Database,
  logger: Logger,
  notifications?: NotificationService,
  neonAuthBaseUrl?: string,
): Promise<number> {
  const now = new Date();

  // Find deletions past their scheduled date that need processing:
  // - "pending": normal flow
  // - "processing": crashed mid-way, needs retry
  // - "failed": previous attempt failed, retry
  const pendingDeletions = await db
    .select()
    .from(deletionRequests)
    .where(
      and(
        inArray(deletionRequests.status, ["pending", "processing", "failed"]),
        lte(deletionRequests.scheduledFor, now),
      ),
    )
    .limit(10);

  let processed = 0;

  for (const deletion of pendingDeletions) {
    try {
      // Mark as processing
      await db
        .update(deletionRequests)
        .set({ status: "processing" })
        .where(eq(deletionRequests.id, deletion.id));

      const tables: Record<string, boolean> = deletion.processedTables ?? {};
      const userId = deletion.userId;

      // Delete in dependency order (children first, user last)
      const steps: Array<{ name: string; fn: () => Promise<void> }> = [
        {
          name: "usage_events",
          fn: () => {
            return db.delete(usageEvents).where(eq(usageEvents.userId, userId)).then(() => {});
          },
        },
        {
          name: "reminder_jobs",
          fn: () => {
            return db.delete(reminderJobs).where(eq(reminderJobs.userId, userId)).then(() => {});
          },
        },
        {
          name: "notification_preferences",
          fn: () => {
            return db
              .delete(notificationPreferences)
              .where(eq(notificationPreferences.userId, userId))
              .then(() => {});
          },
        },
        {
          name: "sessions",
          fn: () => {
            return db.delete(sessions).where(eq(sessions.userId, userId)).then(() => {});
          },
        },
        {
          name: "identities",
          fn: () => {
            return db.delete(identities).where(eq(identities.userId, userId)).then(() => {});
          },
        },
        {
          // Delete encrypted secrets BEFORE connections (child of connections)
          name: "encrypted_secrets",
          fn: async () => {
            // Find all connection IDs for this user, then delete their secrets
            const connections = await db
              .select({ id: aiProviderConnections.id })
              .from(aiProviderConnections)
              .where(eq(aiProviderConnections.userId, userId));

            if (connections.length > 0) {
              const connectionIds = connections.map((c) => c.id);
              await db
                .delete(encryptedSecrets)
                .where(inArray(encryptedSecrets.connectionId, connectionIds));
            }
          },
        },
        {
          name: "ai_provider_connections",
          fn: () => {
            return db
              .delete(aiProviderConnections)
              .where(eq(aiProviderConnections.userId, userId))
              .then(() => {});
          },
        },
        {
          name: "revoked_tokens",
          fn: () => {
            return db
              .delete(revokedTokens)
              .where(eq(revokedTokens.userId, userId))
              .then(() => {});
          },
        },
        {
          name: "audit_events",
          fn: async () => {
            // Anonymise audit events: set user_id to NULL (GDPR requirement).
            // The audit_events FK uses onDelete: "set null", so this is
            // consistent with the schema intent. Metadata is also cleared
            // to remove any PII that may have been stored there.
            await db.execute(
              sql`UPDATE audit_events
                  SET user_id = NULL, metadata = NULL
                  WHERE user_id = ${userId}`,
            );
          },
        },
        {
          name: "send_confirmation_email",
          fn: async () => {
            if (!notifications) return;
            const [user] = await db
              .select({ email: users.email, displayName: users.displayName })
              .from(users)
              .where(eq(users.id, userId))
              .limit(1);

            if (user) {
              await notifications.sendDeletionConfirmation(user.email, {
                displayName: user.displayName ?? user.email,
                email: user.email,
                requestedAt: deletion.requestedAt ?? new Date(),
              });
            }
          },
        },
        {
          name: "neon_auth_user",
          fn: async () => {
            if (!neonAuthBaseUrl) return;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            try {
              const resp = await fetch(
                `${neonAuthBaseUrl}/admin/remove-user`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId }),
                  signal: controller.signal,
                },
              );
              if (!resp.ok && resp.status !== 404) {
                throw new Error(`HTTP ${resp.status}`);
              }
            } catch (err) {
              // Log warning but don't block deletion — record audit event
              logger.warn("Neon Auth user deletion request failed", { userId, error: String(err) });

              await db.execute(
                sql`INSERT INTO audit_events (action, resource_type, metadata, created_at)
                    VALUES ('neon_auth.deletion_pending', 'user',
                            ${JSON.stringify({ userId, error: String(err) })}, NOW())`
              );
            } finally {
              clearTimeout(timeout);
            }
          },
        },
        {
          // Delete the deletion request itself BEFORE the user row,
          // because deletion_requests has onDelete: cascade from users —
          // if we delete the user first, the cascade silently removes this
          // row and we lose the ability to track completion.
          name: "deletion_requests",
          fn: () => {
            return db
              .delete(deletionRequests)
              .where(eq(deletionRequests.id, deletion.id))
              .then(() => {});
          },
        },
        {
          name: "users",
          fn: () => {
            return db.delete(users).where(eq(users.id, userId)).then(() => {});
          },
        },
      ];

      // Track which step we're on for progress updates.
      // After "deletion_requests" step, we can no longer update progress
      // because the row is gone, so we track it in-memory.
      let deletionRequestDeleted = false;

      for (const step of steps) {
        if (tables[step.name]) {
          if (step.name === "deletion_requests") deletionRequestDeleted = true;
          continue; // Already processed in a previous attempt
        }

        await step.fn();
        tables[step.name] = true;

        if (step.name === "deletion_requests") {
          deletionRequestDeleted = true;
          continue; // Row is gone, can't update progress
        }

        // Update progress (only if deletion_request row still exists)
        if (!deletionRequestDeleted) {
          await db
            .update(deletionRequests)
            .set({ processedTables: tables })
            .where(eq(deletionRequests.id, deletion.id));
        }
      }

      processed++;
      logger.info("Deletion request completed", {
        deletionId: deletion.id,
        userId,
        tablesProcessed: Object.keys(tables),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      // Try to update the deletion request — it may have been cascade-deleted
      try {
        await db
          .update(deletionRequests)
          .set({
            status: "failed",
            errorDetails: message,
          })
          .where(eq(deletionRequests.id, deletion.id));
      } catch {
        // Row was likely cascade-deleted, log and move on
      }

      logger.error("Deletion request failed", {
        deletionId: deletion.id,
        error: message,
      });
    }
  }

  return processed;
}
