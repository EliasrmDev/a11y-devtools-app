import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { SecretRepository } from "../../../domain/ports/secret.repository.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type {
  ProviderModelsCacheRepository,
  NormalizedModel,
} from "../../../domain/ports/provider-models.port.js";
import { MemoryModelsCache } from "../../../infrastructure/ai-providers/models/memory-cache.js";
import { getModelsClient, SUPPORTED_MODEL_PROVIDERS } from "../../../infrastructure/ai-providers/models/registry.js";
import { NotFoundError, DomainError } from "../../../domain/errors/index.js";
import type { ProviderType } from "../../../shared/types.js";
import { MODEL_CACHE } from "../../../shared/constants.js";

export class FetchProviderModelsUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly secrets: SecretRepository,
    private readonly crypto: CryptoPort,
    private readonly dbCache: ProviderModelsCacheRepository,
    private readonly memCache: MemoryModelsCache,
  ) {}

  async execute(
    userId: string,
    connectionId: string,
  ): Promise<NormalizedModel[]> {
    const connection = await this.providers.findByIdAndUser(connectionId, userId);
    if (!connection) {
      throw new NotFoundError("Provider connection", connectionId);
    }
    if (!connection.isActive) {
      throw new DomainError("PROVIDER_INACTIVE", "Provider connection is not active");
    }

    const provider = connection.providerType as ProviderType;
    if (!SUPPORTED_MODEL_PROVIDERS.has(provider)) {
      throw new DomainError(
        "UNSUPPORTED_PROVIDER",
        `Model listing is not supported for provider: ${provider}`,
      );
    }

    // 1. Check in-memory cache
    const cacheKey = `${userId}:${connectionId}`;
    const memCached = this.memCache.get(cacheKey);
    if (memCached) return memCached;

    // 2. Check DB cache (keyed by provider type — shared across users)
    const dbCached = await this.dbCache.get(provider, MODEL_CACHE.DB_TTL_MS);
    if (dbCached) {
      this.memCache.set(cacheKey, dbCached);
      return dbCached;
    }

    // 3. Fetch live from provider API
    const secret = await this.secrets.findByConnectionId(connection.id);
    if (!secret) {
      throw new NotFoundError("Provider secret");
    }
    const apiKey = this.crypto.decrypt(secret);

    const client = getModelsClient(provider);
    if (!client) {
      throw new DomainError("UNSUPPORTED_PROVIDER", `No model client for ${provider}`);
    }

    const models = await client.fetchModels(apiKey);

    // 4. Populate both caches
    await this.dbCache.set(provider, models);
    this.memCache.set(cacheKey, models);

    return models;
  }
}
