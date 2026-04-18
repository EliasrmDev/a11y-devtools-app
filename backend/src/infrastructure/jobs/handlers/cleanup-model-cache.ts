import type { Database } from "../../db/client.js";
import type { Logger } from "../../logging/logtail.js";
import { ProviderModelsCacheRepositoryImpl } from "../../db/repositories/provider-models-cache.repository.impl.js";
import { MODEL_CACHE } from "../../../shared/constants.js";

/**
 * Removes expired rows from the provider_models_cache table.
 * Scheduled as a daily background job.
 */
export async function cleanupExpiredModelCache(
  db: Database,
  logger: Logger,
): Promise<void> {
  const repo = new ProviderModelsCacheRepositoryImpl(db);
  const deleted = await repo.deleteExpired(MODEL_CACHE.CLEANUP_MAX_AGE_MS);
  if (deleted > 0) {
    logger.info("Cleaned up expired model cache entries", { deleted });
  }
}
