import { sql, and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import type { NotificationService } from "../../notifications/notification.service.js";
import { aiProviderConnections } from "../../db/schema/ai-provider-connections.js";
import { users } from "../../db/schema/users.js";

/**
 * Alert users whose connections are marked inactive (isActive = false),
 * which indicates the credential has been disabled or invalidated.
 */
export async function remindInvalidCredential(
  db: Database,
  notifications: NotificationService,
  logger: Logger,
): Promise<void> {
  const inactive = await db
    .select({
      connectionId: aiProviderConnections.id,
      displayName: aiProviderConnections.displayName,
      providerType: aiProviderConnections.providerType,
      userId: aiProviderConnections.userId,
      email: users.email,
      userDisplayName: users.displayName,
    })
    .from(aiProviderConnections)
    .innerJoin(users, eq(aiProviderConnections.userId, users.id))
    .where(
      and(
        eq(aiProviderConnections.isActive, false),
        sql`${users.deletedAt} IS NULL`,
      ),
    );

  logger.info("Invalid credential check", { candidateCount: inactive.length });

  for (const row of inactive) {
    try {
      await notifications.sendInvalidCredentialAlert(row.userId, row.email, {
        displayName: row.userDisplayName ?? row.email,
        connectionName: row.displayName,
        providerType: row.providerType,
      });
    } catch (err) {
      logger.warn("Failed to send invalid-credential alert", {
        userId: row.userId,
        connectionId: row.connectionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
