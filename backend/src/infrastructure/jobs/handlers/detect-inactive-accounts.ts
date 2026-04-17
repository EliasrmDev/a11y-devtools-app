import { sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import type { NotificationService } from "../../notifications/notification.service.js";

/** Days without any usage event before an account is considered inactive. */
const INACTIVITY_THRESHOLD_DAYS = 180;

export async function detectInactiveAccounts(
  db: Database,
  notifications: NotificationService,
  logger: Logger,
): Promise<void> {
  const cutoff = new Date(
    Date.now() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60_000,
  );

  /**
   * Find users who:
   * - Have no recent usage events   (last event is before cutoff, or no events at all)
   * - Are not soft-deleted
   * - Have been created before the cutoff (to avoid flagging new accounts)
   */
  const result = await db.execute<{
    user_id: string;
    email: string;
    display_name: string | null;
    last_event_at: string | null;
  }>(sql`
    SELECT
      u.id            AS user_id,
      u.email,
      u.display_name,
      MAX(ue.created_at) AS last_event_at
    FROM users u
    LEFT JOIN usage_events ue ON ue.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND u.created_at < ${cutoff}
    GROUP BY u.id, u.email, u.display_name
    HAVING MAX(ue.created_at) IS NULL
        OR MAX(ue.created_at) < ${cutoff}
  `);

  const inactive = result.rows;
  logger.info("Inactive account check", { candidateCount: inactive.length });

  for (const row of inactive) {
    const lastActivity = row.last_event_at
      ? new Date(row.last_event_at)
      : null;

    const daysSince = lastActivity
      ? Math.floor((Date.now() - lastActivity.getTime()) / (24 * 60 * 60_000))
      : INACTIVITY_THRESHOLD_DAYS;

    try {
      await notifications.sendInactiveAccountReminder(row.user_id, row.email, {
        displayName: row.display_name ?? row.email,
        daysSinceLastActivity: daysSince,
      });
    } catch (err) {
      logger.warn("Failed to send inactive account reminder", {
        userId: row.user_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
