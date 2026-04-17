import type { ProviderType } from "../../shared/types.js";

export interface ProviderConnection {
  id: string;
  userId: string;
  providerType: ProviderType;
  displayName: string;
  baseUrl: string | null;
  customHeadersEnc: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
