import { sql, and, eq, lt } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import type { NotificationService } from "../../notifications/notification.service.js";
import { aiProviderConnections } from "../../db/schema/ai-provider-connections.js";
import { users } from "../../db/schema/users.js";

/** Notify users whose API connections are older than ROTATION_THRESHOLD_DAYS. */
const ROTATION_THRESHOLD_DAYS = 90;

export async function remindKeyRotation(
  db: Database,
  notifications: NotificationService,
  logger: Logger,
): Promise<void> {
  const cutoff = new Date(
    Date.now() - ROTATION_THRESHOLD_DAYS * 24 * 60 * 60_000,
  );

  // Find active connections older than threshold — join with users for email
  const stale = await db
    .select({
      connectionId: aiProviderConnections.id,
      displayName: aiProviderConnections.displayName,
      userId: aiProviderConnections.userId,
      email: users.email,
      userDisplayName: users.displayName,
      createdAt: aiProviderConnections.createdAt,
    })
    .from(aiProviderConnections)
    .innerJoin(users, eq(aiProviderConnections.userId, users.id))
    .where(
      and(
        eq(aiProviderConnections.isActive, true),
        lt(aiProviderConnections.createdAt, cutoff),
        // Only active (non-deleted) user accounts
        sql`${users.deletedAt} IS NULL`,
      ),
    );

  logger.info("Key rotation check", { candidateCount: stale.length });

  for (const row of stale) {
    const daysSince = Math.floor(
      (Date.now() - row.createdAt.getTime()) / (24 * 60 * 60_000),
    );

    try {
      await notifications.sendKeyRotationReminder(row.userId, row.email, {
        displayName: row.userDisplayName ?? row.email,
        connectionName: row.displayName,
        daysSinceRotation: daysSince,
      });
    } catch (err) {
      logger.warn("Failed to send key rotation reminder", {
        userId: row.userId,
        connectionId: row.connectionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
