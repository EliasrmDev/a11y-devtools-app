import { describe, it, expect, vi, beforeEach } from "vitest";
import { TestConnectionUseCase } from "../src/application/use-cases/providers/test-connection.use-case.js";
import { ListModelsUseCase } from "../src/application/use-cases/providers/list-models.use-case.js";
import type { ProviderRepository, GlobalModel } from "../src/domain/ports/provider.repository.js";
import type { SecretRepository } from "../src/domain/ports/secret.repository.js";
import type { CryptoPort, EncryptionEnvelope } from "../src/domain/ports/crypto.port.js";
import type { AuditRepository } from "../src/domain/ports/audit.repository.js";
import { NotFoundError } from "../src/domain/errors/index.js";

// Mock AI client
vi.mock("../src/infrastructure/ai-providers/client.factory.js", () => ({
  createAiClient: () => ({
    complete: vi.fn().mockResolvedValue({
      content: "Hi!",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    }),
    completeStream: vi.fn(),
  }),
}));

// Mock SSRF guard — allow known providers
vi.mock("../src/infrastructure/ai-providers/ssrf-guard.js", () => ({
  validateProviderUrl: vi.fn().mockResolvedValue(new URL("https://api.openai.com/v1")),
}));

function mockProviderRepo(overrides: Partial<ProviderRepository> = {}): ProviderRepository {
  return {
    findById: vi.fn(),
    findByIdAndUser: vi.fn().mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      providerType: "openai",
      displayName: "My OpenAI",
      baseUrl: "https://api.openai.com/v1",
      customHeadersEnc: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findByUser: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listGlobalModels: vi.fn().mockResolvedValue([]),
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
      id: "sec-1",
      connectionId: "conn-1",
      secretType: "api_key",
      encryptedDek: Buffer.alloc(48),
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
    encrypt: vi.fn().mockReturnValue({
      encryptedDek: Buffer.alloc(48),
      dekIv: Buffer.alloc(12),
      ciphertext: Buffer.alloc(32),
      cipherIv: Buffer.alloc(12),
      authTag: Buffer.alloc(16),
      kekVersion: 1,
    }),
    decrypt: vi.fn().mockReturnValue("sk-test-key-123"),
    rotateDek: vi.fn(),
  };
}

function mockAudit(): AuditRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByUser: vi.fn(),
    findAll: vi.fn(),
    nullifyUser: vi.fn(),
  };
}

describe("TestConnectionUseCase", () => {
  let providers: ProviderRepository;
  let secrets: SecretRepository;
  let crypto: CryptoPort;
  let audit: AuditRepository;

  beforeEach(() => {
    providers = mockProviderRepo();
    secrets = mockSecretRepo();
    crypto = mockCrypto();
    audit = mockAudit();
  });

  it("should return success for a valid connection", async () => {
    const uc = new TestConnectionUseCase(providers, secrets, crypto, audit);
    const result = await uc.execute("user-1", "conn-1", {});

    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it("should throw NotFoundError for non-existent connection", async () => {
    providers = mockProviderRepo({
      findByIdAndUser: vi.fn().mockResolvedValue(null),
    });
    const uc = new TestConnectionUseCase(providers, secrets, crypto, audit);

    await expect(
      uc.execute("user-1", "missing", {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("should throw NotFoundError when secret is missing", async () => {
    secrets = {
      ...mockSecretRepo(),
      findByConnectionId: vi.fn().mockResolvedValue(null),
    };
    const uc = new TestConnectionUseCase(providers, secrets, crypto, audit);

    await expect(
      uc.execute("user-1", "conn-1", {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("should audit successful test", async () => {
    const uc = new TestConnectionUseCase(providers, secrets, crypto, audit);
    await uc.execute("user-1", "conn-1", { ipAddress: "1.2.3.4" });

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.test_success",
        resourceId: "conn-1",
      }),
    );
  });

  it("should return failure and audit when AI client fails", async () => {
    // Use a custom provider with no baseUrl → triggers "No base URL" error
    const failingProviders = mockProviderRepo({
      findByIdAndUser: vi.fn().mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        providerType: "custom",
        displayName: "Custom Provider",
        baseUrl: null,
        customHeadersEnc: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });

    const uc = new TestConnectionUseCase(failingProviders, secrets, crypto, audit);

    await expect(
      uc.execute("user-1", "conn-1", {}),
    ).rejects.toThrow("No base URL configured");
  });
});

describe("ListModelsUseCase", () => {
  const sampleModels: GlobalModel[] = [
    { id: "m1", providerType: "openai", modelId: "gpt-4o", displayName: "GPT-4o", isEnabled: true },
    { id: "m2", providerType: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", isEnabled: true },
    { id: "m3", providerType: "anthropic", modelId: "claude-3-5-sonnet", displayName: "Claude 3.5 Sonnet", isEnabled: true },
    { id: "m4", providerType: "anthropic", modelId: "claude-3-haiku", displayName: "Claude 3 Haiku", isEnabled: false },
  ];

  it("should return all models when no filters", async () => {
    const providers = mockProviderRepo({
      listGlobalModels: vi.fn().mockResolvedValue(sampleModels),
    });
    const uc = new ListModelsUseCase(providers);

    const result = await uc.execute();
    expect(result).toHaveLength(4);
  });

  it("should filter by providerType", async () => {
    const providers = mockProviderRepo({
      listGlobalModels: vi.fn().mockResolvedValue(sampleModels),
    });
    const uc = new ListModelsUseCase(providers);

    const result = await uc.execute({ providerType: "anthropic" });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.providerType === "anthropic")).toBe(true);
  });

  it("should filter enabled-only models", async () => {
    const providers = mockProviderRepo({
      listGlobalModels: vi.fn().mockResolvedValue(sampleModels),
    });
    const uc = new ListModelsUseCase(providers);

    const result = await uc.execute({ enabledOnly: true });
    expect(result).toHaveLength(3);
    expect(result.every((m) => m.isEnabled)).toBe(true);
  });

  it("should combine filters", async () => {
    const providers = mockProviderRepo({
      listGlobalModels: vi.fn().mockResolvedValue(sampleModels),
    });
    const uc = new ListModelsUseCase(providers);

    const result = await uc.execute({
      providerType: "anthropic",
      enabledOnly: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe("claude-3-5-sonnet");
  });
});
