import { eq, and } from "drizzle-orm";
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

  private toGlobalModel(
    row: typeof providerModels.$inferSelect,
  ): GlobalModel {
    return {
      id: row.id,
      providerType: row.providerType,
      modelId: row.modelId,
      displayName: row.displayName,
      isEnabled: row.isAvailable,
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
