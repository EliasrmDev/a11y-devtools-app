import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import { usageEvents } from "../../db/schema/usage-events.js";
import { lt } from "drizzle-orm";
import { RETENTION } from "../../../shared/constants.js";

export async function cleanupOldUsageEvents(
  db: Database,
  logger: Logger,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION.USAGE_EVENTS_DAYS);

  const result = await db
    .delete(usageEvents)
    .where(lt(usageEvents.createdAt, cutoff));

  const count = result.rowCount ?? 0;
  logger.info("Cleaned up old usage events", { count, cutoffDate: cutoff.toISOString() });
  return count;
}
