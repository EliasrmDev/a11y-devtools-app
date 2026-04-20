import { eq, and, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { aiProviderConnections } from "../schema/ai-provider-connections.js";
import { providerModels } from "../schema/provider-models.js";
import type { ProviderConnection } from "../../../domain/entities/provider-connection.entity.js";
import type {
  ProviderRepository,
  CreateProviderData,
  UpdateProviderData,
  GlobalModel,
  CreateGlobalModelData,
} from "../../../domain/ports/provider.repository.js";

export class ProviderRepositoryImpl implements ProviderRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<ProviderConnection | null> {
    const rows = await this.db
      .select()
      .from(aiProviderConnections)
      .where(eq(aiProviderConnections.id, id))
      .limit(1);

    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async findByIdAndUser(
    id: string,
    userId: string,
  ): Promise<ProviderConnection | null> {
    const rows = await this.db
      .select()
      .from(aiProviderConnections)
      .where(
        and(
          eq(aiProviderConnections.id, id),
          eq(aiProviderConnections.userId, userId),
        ),
      )
      .limit(1);

    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async findByUser(userId: string): Promise<ProviderConnection[]> {
    const rows = await this.db
      .select()
      .from(aiProviderConnections)
      .where(eq(aiProviderConnections.userId, userId))
      .orderBy(aiProviderConnections.createdAt);

    return rows.map(this.toDomain);
  }

  async create(data: CreateProviderData): Promise<ProviderConnection> {
    const rows = await this.db
      .insert(aiProviderConnections)
      .values({
        userId: data.userId,
        providerType: data.providerType,
        displayName: data.displayName,
        baseUrl: data.baseUrl ?? null,
        customHeadersEnc: data.customHeadersEnc ?? null,
      })
      .returning();

    return this.toDomain(rows[0]);
  }

  async update(
    id: string,
    data: UpdateProviderData,
  ): Promise<ProviderConnection> {
    const rows = await this.db
      .update(aiProviderConnections)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(aiProviderConnections.id, id))
      .returning();

    return this.toDomain(rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(aiProviderConnections)
      .where(eq(aiProviderConnections.id, id));
  }

  // --- Global model management ---

  async listGlobalModels(): Promise<GlobalModel[]> {
    const rows = await this.db
      .select()
      .from(providerModels)
      .orderBy(providerModels.providerType, providerModels.displayName);

    return rows.map(this.toGlobalModel);
  }

  async findGlobalModelById(id: string): Promise<GlobalModel | null> {
    const rows = await this.db
      .select()
      .from(providerModels)
      .where(eq(providerModels.id, id))
      .limit(1);

    return rows[0] ? this.toGlobalModel(rows[0]) : null;
  }

  async createGlobalModel(data: CreateGlobalModelData): Promise<string> {
    const rows = await this.db
      .insert(providerModels)
      .values({
        providerType: data.providerType,
        modelId: data.modelId,
        displayName: data.displayName,
        isAvailable: data.isEnabled,
        maxTokens: data.maxTokens ?? null,
        supportsStreaming: data.supportsStreaming ?? true,
        supportsVision: data.supportsVision ?? false,
      })
      .returning({ id: providerModels.id });

    return rows[0].id;
  }

  async updateGlobalModel(id: string, data: Partial<GlobalModel>): Promise<void> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.isEnabled !== undefined) updateData.isAvailable = data.isEnabled;
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.providerType !== undefined) updateData.providerType = data.providerType;
    if (data.modelId !== undefined) updateData.modelId = data.modelId;

    await this.db
      .update(providerModels)
      .set(updateData)
      .where(eq(providerModels.id, id));
  }

  async deleteGlobalModel(id: string): Promise<void> {
    await this.db
      .delete(providerModels)
      .where(eq(providerModels.id, id));
  }

  async bulkUpsertGlobalModels(
    models: CreateGlobalModelData[],
  ): Promise<{ added: number; updated: number }> {
    if (models.length === 0) return { added: 0, updated: 0 };

    // Get existing model IDs for this batch to determine added vs updated
    const existingRows = await this.db
      .select({ providerType: providerModels.providerType, modelId: providerModels.modelId })
      .from(providerModels);
    const existingKeys = new Set(
      existingRows.map((r) => `${r.providerType}:${r.modelId}`),
    );

    let added = 0;
    let updated = 0;

    // Process in batches of 50 to avoid oversized queries
    const BATCH_SIZE = 50;
    for (let i = 0; i < models.length; i += BATCH_SIZE) {
      const batch = models.slice(i, i + BATCH_SIZE);

      await this.db
        .insert(providerModels)
        .values(
          batch.map((m) => ({
            providerType: m.providerType,
            modelId: m.modelId,
            displayName: m.displayName,
            isAvailable: m.isEnabled,
            maxTokens: m.maxTokens ?? null,
            supportsStreaming: m.supportsStreaming ?? true,
            supportsVision: m.supportsVision ?? false,
          })),
        )
        .onConflictDoUpdate({
          target: [providerModels.providerType, providerModels.modelId],
          set: {
            displayName: sql`excluded.display_name`,
            maxTokens: sql`excluded.max_tokens`,
            supportsStreaming: sql`excluded.supports_streaming`,
            supportsVision: sql`excluded.supports_vision`,
            updatedAt: new Date(),
          },
        });

      for (const m of batch) {
        if (existingKeys.has(`${m.providerType}:${m.modelId}`)) {
          updated++;
        } else {
          added++;
        }
      }
    }

    return { added, updated };
  }

  async bulkToggleByProvider(providerType: string, enabled: boolean): Promise<number> {
    const result = await this.db
      .update(providerModels)
      .set({ isAvailable: enabled, updatedAt: new Date() })
      .where(eq(providerModels.providerType, providerType))
      .returning({ id: providerModels.id });
    return result.length;
  }

  private toGlobalModel(
    row: typeof providerModels.$inferSelect,
  ): GlobalModel {
    return {
      id: row.id,
      providerType: row.providerType,
      modelId: row.modelId,
      displayName: row.displayName,
      isEnabled: row.isAvailable,
      maxTokens: row.maxTokens,
      supportsStreaming: row.supportsStreaming,
      supportsVision: row.supportsVision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toDomain(
    row: typeof aiProviderConnections.$inferSelect,
  ): ProviderConnection {
    return {
      id: row.id,
      userId: row.userId,
      providerType: row.providerType as ProviderConnection["providerType"],
      displayName: row.displayName,
      baseUrl: row.baseUrl,
      customHeadersEnc: row.customHeadersEnc,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
