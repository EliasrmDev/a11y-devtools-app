import { describe, it, expect, vi, beforeEach } from "vitest";
import { FetchProviderModelsUseCase } from "../src/application/use-cases/providers/fetch-provider-models.use-case.js";
import { FetchAllProviderModelsUseCase } from "../src/application/use-cases/providers/fetch-all-provider-models.use-case.js";
import { MemoryModelsCache } from "../src/infrastructure/ai-providers/models/memory-cache.js";
import type { ProviderRepository } from "../src/domain/ports/provider.repository.js";
import type { SecretRepository } from "../src/domain/ports/secret.repository.js";
import type { CryptoPort } from "../src/domain/ports/crypto.port.js";
import type { ProviderModelsCacheRepository, NormalizedModel } from "../src/domain/ports/provider-models.port.js";
import type { ProviderConnection } from "../src/domain/entities/provider-connection.entity.js";

// --- Helpers ---

const sampleModels: NormalizedModel[] = [
  {
    id: "gpt-4o",
    name: "gpt-4o",
    provider: "openai",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    pricing: null,
  },
];

const sampleConnection: ProviderConnection = {
  id: "conn-1",
  userId: "user-1",
  providerType: "openai",
  displayName: "My OpenAI",
  baseUrl: null,
  customHeadersEnc: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockProviderRepo(overrides: Partial<ProviderRepository> = {}): ProviderRepository {
  return {
    findById: vi.fn(),
    findByIdAndUser: vi.fn().mockResolvedValue(sampleConnection),
    findByUser: vi.fn().mockResolvedValue([sampleConnection]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listGlobalModels: vi.fn(),
    findGlobalModelById: vi.fn(),
    createGlobalModel: vi.fn(),
    updateGlobalModel: vi.fn(),
    deleteGlobalModel: vi.fn(),
    ...overrides,
  };
}

function mockSecretRepo(): SecretRepository {
  return {
    findByConnectionId: vi.fn().mockResolvedValue({
      id: "secret-1",
      connectionId: "conn-1",
      secretType: "api_key",
      encryptedDek: Buffer.alloc(32),
      dekIv: Buffer.alloc(12),
      ciphertext: Buffer.alloc(32),
      cipherIv: Buffer.alloc(12),
      authTag: Buffer.alloc(16),
      kekVersion: 1,
      createdAt: new Date(),
      rotatedAt: null,
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByKekVersion: vi.fn(),
  };
}

function mockCrypto(): CryptoPort {
  return {
    encrypt: vi.fn(),
    decrypt: vi.fn().mockReturnValue("sk-test-key-123"),
    rotateDek: vi.fn(),
  };
}

function mockDbCache(overrides: Partial<ProviderModelsCacheRepository> = {}): ProviderModelsCacheRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

// --- Tests ---

describe("MemoryModelsCache", () => {
  it("returns null for missing keys", () => {
    const cache = new MemoryModelsCache(60_000);
    expect(cache.get("missing")).toBeNull();
  });

  it("returns cached models within TTL", () => {
    const cache = new MemoryModelsCache(60_000);
    cache.set("openai", sampleModels);
    expect(cache.get("openai")).toEqual(sampleModels);
  });

  it("evicts expired entries", () => {
    const cache = new MemoryModelsCache(0); // 0ms TTL
    cache.set("openai", sampleModels);
    expect(cache.get("openai")).toBeNull();
  });
});

describe("FetchProviderModelsUseCase", () => {
  let providers: ProviderRepository;
  let secrets: SecretRepository;
  let crypto: CryptoPort;
  let dbCache: ProviderModelsCacheRepository;
  let memCache: MemoryModelsCache;

  beforeEach(() => {
    providers = mockProviderRepo();
    secrets = mockSecretRepo();
    crypto = mockCrypto();
    dbCache = mockDbCache();
    memCache = new MemoryModelsCache(300_000);
  });

  it("returns models from memory cache when available", async () => {
    memCache.set("user-1:conn-1", sampleModels);
    const uc = new FetchProviderModelsUseCase(providers, secrets, crypto, dbCache, memCache);
    const result = await uc.execute("user-1", "conn-1");

    expect(result).toEqual(sampleModels);
    expect(dbCache.get).not.toHaveBeenCalled();
    expect(secrets.findByConnectionId).not.toHaveBeenCalled();
  });

  it("falls back to DB cache when memory cache misses", async () => {
    dbCache = mockDbCache({ get: vi.fn().mockResolvedValue(sampleModels) });
    const uc = new FetchProviderModelsUseCase(providers, secrets, crypto, dbCache, memCache);
    const result = await uc.execute("user-1", "conn-1");

    expect(result).toEqual(sampleModels);
    expect(dbCache.get).toHaveBeenCalledWith("openai", expect.any(Number));
    expect(secrets.findByConnectionId).not.toHaveBeenCalled();
  });

  it("throws NotFoundError for missing connection", async () => {
    providers = mockProviderRepo({ findByIdAndUser: vi.fn().mockResolvedValue(null) });
    const uc = new FetchProviderModelsUseCase(providers, secrets, crypto, dbCache, memCache);

    await expect(uc.execute("user-1", "conn-999")).rejects.toThrow("not found");
  });

  it("throws for inactive connection", async () => {
    providers = mockProviderRepo({
      findByIdAndUser: vi.fn().mockResolvedValue({ ...sampleConnection, isActive: false }),
    });
    const uc = new FetchProviderModelsUseCase(providers, secrets, crypto, dbCache, memCache);

    await expect(uc.execute("user-1", "conn-1")).rejects.toThrow("not active");
  });
});

describe("FetchAllProviderModelsUseCase", () => {
  it("aggregates models from all active connections", async () => {
    const providers = mockProviderRepo();
    const secrets = mockSecretRepo();
    const crypto = mockCrypto();
    const dbCache = mockDbCache({ get: vi.fn().mockResolvedValue(sampleModels) });
    const memCache = new MemoryModelsCache(300_000);

    const uc = new FetchAllProviderModelsUseCase(providers, secrets, crypto, dbCache, memCache);
    const results = await uc.execute("user-1");

    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe("openai");
    expect(results[0].models).toEqual(sampleModels);
    expect(results[0].error).toBeNull();
  });

  it("returns empty array when user has no connections", async () => {
    const providers = mockProviderRepo({ findByUser: vi.fn().mockResolvedValue([]) });
    const secrets = mockSecretRepo();
    const crypto = mockCrypto();
    const dbCache = mockDbCache();
    const memCache = new MemoryModelsCache(300_000);

    const uc = new FetchAllProviderModelsUseCase(providers, secrets, crypto, dbCache, memCache);
    const results = await uc.execute("user-1");

    expect(results).toHaveLength(0);
  });
});
