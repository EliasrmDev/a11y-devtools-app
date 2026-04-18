import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { SecretRepository } from "../../../domain/ports/secret.repository.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type {
  ProviderModelsCacheRepository,
  NormalizedModel,
} from "../../../domain/ports/provider-models.port.js";
import { MemoryModelsCache } from "../../../infrastructure/ai-providers/models/memory-cache.js";
import { getModelsClient, SUPPORTED_MODEL_PROVIDERS } from "../../../infrastructure/ai-providers/models/registry.js";
import type { ProviderType } from "../../../shared/types.js";
import { MODEL_CACHE } from "../../../shared/constants.js";

export interface AggregatedModelsResult {
  provider: ProviderType;
  connectionId: string;
  models: NormalizedModel[];
  error: string | null;
}

export class FetchAllProviderModelsUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly secrets: SecretRepository,
    private readonly crypto: CryptoPort,
    private readonly dbCache: ProviderModelsCacheRepository,
    private readonly memCache: MemoryModelsCache,
  ) {}

  async execute(userId: string): Promise<AggregatedModelsResult[]> {
    const connections = await this.providers.findByUser(userId);
    const results: AggregatedModelsResult[] = [];

    const tasks = connections
      .filter((c) => c.isActive && SUPPORTED_MODEL_PROVIDERS.has(c.providerType as ProviderType))
      .map(async (connection) => {
        const provider = connection.providerType as ProviderType;
        try {
          // 1. Check in-memory cache
          const cacheKey = `${userId}:${connection.id}`;
          const memCached = this.memCache.get(cacheKey);
          if (memCached) {
            return { provider, connectionId: connection.id, models: memCached, error: null };
          }

          // 2. Check DB cache
          const dbCached = await this.dbCache.get(provider, MODEL_CACHE.DB_TTL_MS);
          if (dbCached) {
            this.memCache.set(cacheKey, dbCached);
            return { provider, connectionId: connection.id, models: dbCached, error: null };
          }

          // 3. Fetch live
          const secret = await this.secrets.findByConnectionId(connection.id);
          if (!secret) {
            return { provider, connectionId: connection.id, models: [], error: "No API key configured" };
          }

          const apiKey = this.crypto.decrypt(secret);
          const client = getModelsClient(provider);
          if (!client) {
            return { provider, connectionId: connection.id, models: [], error: "Unsupported provider" };
          }

          const models = await client.fetchModels(apiKey);
          await this.dbCache.set(provider, models);
          this.memCache.set(cacheKey, models);

          return { provider, connectionId: connection.id, models, error: null };
        } catch (err) {
          return {
            provider,
            connectionId: connection.id,
            models: [],
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      });

    const settled = await Promise.allSettled(tasks);
    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }

    return results;
  }
}
