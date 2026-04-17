import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import { NotFoundError } from "../../../domain/errors/index.js";

export class ManageModelsUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly audit: AuditRepository,
  ) {}

  async listGlobalModels(): Promise<
    Array<{
      id: string;
      providerType: string;
      modelId: string;
      displayName: string;
      isEnabled: boolean;
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
}
