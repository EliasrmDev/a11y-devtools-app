import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import { revokedTokens } from "../../db/schema/revoked-tokens.js";
import { sessions } from "../../db/schema/sessions.js";
import { lt } from "drizzle-orm";

export async function cleanupExpiredTokens(
  db: Database,
  logger: Logger,
): Promise<number> {
  const now = new Date();
  const result = await db
    .delete(revokedTokens)
    .where(lt(revokedTokens.expiresAt, now));

  const count = result.rowCount ?? 0;
  logger.info("Cleaned up expired revoked tokens", { count });
  return count;
}

export async function cleanupExpiredSessions(
  db: Database,
  logger: Logger,
): Promise<number> {
  const now = new Date();
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now));

  const count = result.rowCount ?? 0;
  logger.info("Cleaned up expired sessions", { count });
  return count;
}
