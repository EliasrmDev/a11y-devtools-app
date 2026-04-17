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
import { revokedTokens } from "../../db/schema/revoked-tokens.js";
import { users } from "../../db/schema/users.js";
import { sql, eq, and, lte } from "drizzle-orm";

/**
 * Processes pending deletion requests that have passed their grace period.
 * Deletes data table-by-table, tracking progress in processed_tables JSONB.
 */
export async function processDeletionRequests(
  db: Database,
  logger: Logger,
  notifications?: NotificationService,
): Promise<number> {
  const now = new Date();

  // Find pending deletions past their scheduled date
  const pendingDeletions = await db
    .select()
    .from(deletionRequests)
    .where(
      and(
        eq(deletionRequests.status, "pending"),
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

      // Delete in dependency order (children first)
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
          name: "users",
          fn: () => {
            return db.delete(users).where(eq(users.id, userId)).then(() => {});
          },
        },
      ];

      for (const step of steps) {
        if (tables[step.name]) continue; // Already processed

        await step.fn();
        tables[step.name] = true;

        // Update progress
        await db
          .update(deletionRequests)
          .set({ processedTables: tables })
          .where(eq(deletionRequests.id, deletion.id));
      }

      // Mark as completed
      await db
        .update(deletionRequests)
        .set({
          status: "completed",
          completedAt: new Date(),
          processedTables: tables,
        })
        .where(eq(deletionRequests.id, deletion.id));

      processed++;
      logger.info("Deletion request completed", {
        deletionId: deletion.id,
        userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await db
        .update(deletionRequests)
        .set({
          status: "failed",
          errorDetails: message,
        })
        .where(eq(deletionRequests.id, deletion.id));

      logger.error("Deletion request failed", {
        deletionId: deletion.id,
        error: message,
      });
    }
  }

  return processed;
}
