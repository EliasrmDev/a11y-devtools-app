import { eq, lt } from "drizzle-orm";
import type { Database } from "../client.js";
import { providerModelsCache } from "../schema/provider-models-cache.js";
import type {
  ProviderModelsCacheRepository,
  NormalizedModel,
} from "../../../domain/ports/provider-models.port.js";
import type { ProviderType } from "../../../shared/types.js";

export class ProviderModelsCacheRepositoryImpl implements ProviderModelsCacheRepository {
  constructor(private readonly db: Database) {}

  async get(provider: ProviderType, maxAgeMs: number): Promise<NormalizedModel[] | null> {
    const rows = await this.db
      .select()
      .from(providerModelsCache)
      .where(eq(providerModelsCache.providerType, provider))
      .limit(1);

    if (!rows[0]) return null;

    const age = Date.now() - rows[0].fetchedAt.getTime();
    if (age > maxAgeMs) return null;

    return rows[0].models as NormalizedModel[];
  }

  async set(provider: ProviderType, models: NormalizedModel[]): Promise<void> {
    // Upsert: insert or update on conflict
    await this.db
      .insert(providerModelsCache)
      .values({
        providerType: provider,
        models: models as unknown[],
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: providerModelsCache.providerType,
        set: {
          models: models as unknown[],
          fetchedAt: new Date(),
        },
      });
  }

  async deleteExpired(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await this.db
      .delete(providerModelsCache)
      .where(lt(providerModelsCache.fetchedAt, cutoff))
      .returning({ id: providerModelsCache.id });
    return result.length;
  }
}
