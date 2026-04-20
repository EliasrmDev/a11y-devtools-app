import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import { NotFoundError, DomainError } from "../../../domain/errors/index.js";
import { getModelsClient } from "../../../infrastructure/ai-providers/models/registry.js";
import type { ProviderType } from "../../../shared/types.js";

export interface AdminApiKeysConfig {
  openai?: string;
  anthropic?: string;
  groq?: string;
  gemini?: string;
  openrouter?: string;
}

export class ManageModelsUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly audit: AuditRepository,
    private readonly adminApiKeys: AdminApiKeysConfig = {},
  ) {}

  async listGlobalModels(): Promise<
    Array<{
      id: string;
      providerType: string;
      modelId: string;
      displayName: string;
      isEnabled: boolean;
      maxTokens: number | null;
      supportsStreaming: boolean;
      supportsVision: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    return this.providers.listGlobalModels();
  }

  async toggleModel(
    modelId: string,
    enabled: boolean,
    adminUserId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const model = await this.providers.findGlobalModelById(modelId);
    if (!model) {
      throw new NotFoundError("Model", modelId);
    }

    await this.providers.updateGlobalModel(modelId, { isEnabled: enabled });

    await this.audit.create({
      userId: adminUserId,
      action: enabled ? "admin.model_enabled" : "admin.model_disabled",
      resourceType: "model",
      resourceId: modelId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { modelId: model.modelId, providerType: model.providerType },
    });
  }

  async createModel(
    input: {
      providerType: string;
      modelId: string;
      displayName: string;
      isEnabled: boolean;
    },
    adminUserId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<{ id: string }> {
    const id = await this.providers.createGlobalModel(input);

    await this.audit.create({
      userId: adminUserId,
      action: "admin.model_created",
      resourceType: "model",
      resourceId: id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { modelId: input.modelId, providerType: input.providerType },
    });

    return { id };
  }

  async deleteModel(
    modelId: string,
    adminUserId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const model = await this.providers.findGlobalModelById(modelId);
    if (!model) {
      throw new NotFoundError("Model", modelId);
    }

    await this.providers.deleteGlobalModel(modelId);

    await this.audit.create({
      userId: adminUserId,
      action: "admin.model_deleted",
      resourceType: "model",
      resourceId: modelId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { modelId: model.modelId, providerType: model.providerType },
    });
  }

  async bulkToggleByProvider(
    providerType: string,
    enabled: boolean,
    adminUserId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<{ updated: number }> {
    const updated = await this.providers.bulkToggleByProvider(providerType, enabled);

    await this.audit.create({
      userId: adminUserId,
      action: enabled ? "admin.models_bulk_enabled" : "admin.models_bulk_disabled",
      resourceType: "model",
      resourceId: null,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { providerType, count: updated },
    });

    return { updated };
  }

  async syncModelsFromProvider(
    providerType: ProviderType,
    adminUserId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<{ added: number; updated: number; total: number }> {
    // Resolve API key — OpenRouter is public (no key needed)
    const keyMap: Record<string, string | undefined> = {
      openai: this.adminApiKeys.openai,
      anthropic: this.adminApiKeys.anthropic,
      groq: this.adminApiKeys.groq,
      gemini: this.adminApiKeys.gemini,
      openrouter: this.adminApiKeys.openrouter,
    };
    // OpenRouter is a public API — no key required
    const apiKey = keyMap[providerType] ?? (providerType === "openrouter" ? "" : undefined);
    if (apiKey === undefined) {
      throw new DomainError(
        "MISSING_API_KEY",
        `No admin API key configured for ${providerType}. Set ADMIN_${providerType.toUpperCase()}_API_KEY.`,
      );
    }

    const client = getModelsClient(providerType);
    if (!client) {
      throw new DomainError("UNSUPPORTED_PROVIDER", `Model sync not supported for ${providerType}`);
    }

    const models = await client.fetchModels(apiKey).catch((err) => {
      throw new DomainError(
        "SYNC_FAILED",
        `Failed to fetch models from ${providerType}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    });
    if (!models.length) {
      throw new DomainError(
        "NO_MODELS",
        `No text-processing models returned from ${providerType} API.`,
      );
    }

    // Map NormalizedModel[] → CreateGlobalModelData[] (default disabled)
    const globalModels = models.map((m) => ({
      providerType,
      modelId: m.id,
      displayName: m.name,
      isEnabled: false,
      maxTokens: m.maxOutputTokens ?? m.contextWindow ?? null,
      supportsStreaming: m.supportsStreaming,
      supportsVision: m.supportsVision,
    }));

    const result = await this.providers.bulkUpsertGlobalModels(globalModels);

    await this.audit.create({
      userId: adminUserId,
      action: "admin.models_synced",
      resourceType: "model",
      resourceId: null,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { providerType, added: result.added, updated: result.updated, total: models.length },
    });

    return { ...result, total: models.length };
  }
}
