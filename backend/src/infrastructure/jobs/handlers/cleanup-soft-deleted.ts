import { sql, lt, and, isNotNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import { users } from "../../db/schema/users.js";

/** Grace period before soft-deleted records are hard-purged. */
const PURGE_AFTER_DAYS = 30;

/**
 * Hard-delete users and their provider connections after the soft-delete
 * grace period has elapsed.
 *
 * Note: the deletion cascade in process-deletion.ts handles full RTBF
 * tear-downs. This handler only purges records that were soft-deleted
 * through other means (e.g. admin block followed by no reinstatement).
 */
export async function cleanupSoftDeleted(
  db: Database,
  logger: Logger,
): Promise<void> {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60_000);

  // Hard-delete connections belonging to soft-deleted users first (FK safety)
  const deletedConnections = await db.execute(sql`
    DELETE FROM ai_provider_connections
    WHERE user_id IN (
      SELECT id FROM users
      WHERE deleted_at IS NOT NULL
        AND deleted_at < ${cutoff}
    )
  `);

  const connectionCount = deletedConnections.rowCount ?? 0;

  // Hard-delete the soft-deleted users
  const deletedUsers = await db
    .delete(users)
    .where(
      and(
        isNotNull(users.deletedAt),
        lt(users.deletedAt, cutoff),
      ),
    );

  const userCount = deletedUsers.rowCount ?? 0;

  logger.info("Soft-deleted records purged", {
    purgedUsers: userCount,
    purgedConnections: connectionCount,
    cutoff: cutoff.toISOString(),
  });
}
