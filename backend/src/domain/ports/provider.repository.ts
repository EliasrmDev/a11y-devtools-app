import type { ProviderConnection } from "../entities/provider-connection.entity.js";
import type { ProviderType } from "../../shared/types.js";

export interface ProviderRepository {
  findById(id: string): Promise<ProviderConnection | null>;
  findByIdAndUser(id: string, userId: string): Promise<ProviderConnection | null>;
  findByUser(userId: string): Promise<ProviderConnection[]>;
  create(data: CreateProviderData): Promise<ProviderConnection>;
  update(id: string, data: UpdateProviderData): Promise<ProviderConnection>;
  delete(id: string): Promise<void>;

  // Global model management (admin)
  listGlobalModels(): Promise<GlobalModel[]>;
  findGlobalModelById(id: string): Promise<GlobalModel | null>;
  createGlobalModel(data: CreateGlobalModelData): Promise<string>;
  updateGlobalModel(id: string, data: Partial<GlobalModel>): Promise<void>;
  deleteGlobalModel(id: string): Promise<void>;
}

export interface GlobalModel {
  id: string;
  providerType: string;
  modelId: string;
  displayName: string;
  isEnabled: boolean;
}

export interface CreateGlobalModelData {
  providerType: string;
  modelId: string;
  displayName: string;
  isEnabled: boolean;
}

export interface CreateProviderData {
  userId: string;
  providerType: ProviderType;
  displayName: string;
  baseUrl?: string | null;
  customHeadersEnc?: string | null;
}

export interface UpdateProviderData {
  displayName?: string;
  baseUrl?: string | null;
  customHeadersEnc?: string | null;
  isActive?: boolean;
}
