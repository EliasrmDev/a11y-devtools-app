import { lt, and, isNotNull, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import { users } from "../../db/schema/users.js";
import { auditEvents } from "../../db/schema/audit-events.js";
import { aiProviderConnections } from "../../db/schema/ai-provider-connections.js";

/** Grace period before soft-deleted records are hard-purged. */
const PURGE_AFTER_DAYS = 30;

/**
 * Hard-delete users and their provider connections after the soft-delete
 * grace period has elapsed.
 *
 * Note: the deletion cascade in process-deletion.ts handles full RTBF
 * tear-downs for user-initiated deletions. This handler purges records
 * soft-deleted through other means (e.g. admin block with no reinstatement).
 */
export async function cleanupSoftDeleted(
  db: Database,
  logger: Logger,
  neonAuthBaseUrl?: string,
): Promise<void> {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60_000);

  // Collect IDs first so we can run targeted cleanup steps
  const expiredUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)));

  if (expiredUsers.length === 0) {
    logger.info("No soft-deleted records to purge");
    return;
  }

  const userIds = expiredUsers.map((u) => u.id);

  // Clear metadata from audit events — the FK ON DELETE SET NULL will null
  // out user_id when the user row is deleted, but metadata may still contain
  // PII. Wipe it here to match what process-deletion does for RTBF requests.
  await db
    .update(auditEvents)
    .set({ metadata: null })
    .where(inArray(auditEvents.userId, userIds));

  // Notify Neon Auth to remove users from the neon_auth schema (best-effort)
  if (neonAuthBaseUrl) {
    for (const { id } of expiredUsers) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const resp = await fetch(`${neonAuthBaseUrl}/admin/remove-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id }),
          signal: controller.signal,
        });
        if (!resp.ok && resp.status !== 404) {
          logger.warn("Neon Auth removal failed during soft-delete cleanup", {
            userId: id,
            status: resp.status,
          });
        }
      } catch (err) {
        logger.warn("Neon Auth removal error during soft-delete cleanup", {
          userId: id,
          error: String(err),
        });
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  // Delete connections before users to cascade-delete encrypted_secrets
  const deletedConnections = await db
    .delete(aiProviderConnections)
    .where(inArray(aiProviderConnections.userId, userIds));

  const connectionCount = deletedConnections.rowCount ?? 0;

  // Hard-delete users — cascades to all remaining child tables
  const deletedUsers = await db
    .delete(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)));

  const userCount = deletedUsers.rowCount ?? 0;

  logger.info("Soft-deleted records purged", {
    purgedUsers: userCount,
    purgedConnections: connectionCount,
    cutoff: cutoff.toISOString(),
  });
}
