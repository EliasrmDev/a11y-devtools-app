import type { ProviderType } from "../../shared/types.js";

/** Normalised model descriptor returned by every provider client */
export interface NormalizedModel {
  id: string;
  name: string;
  provider: ProviderType;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  supportsStreaming: boolean;
  supportsVision: boolean;
  pricing: { inputPer1M: number | null; outputPer1M: number | null } | null;
}

/** Contract every per-provider model client must implement */
export interface ProviderModelsClient {
  readonly provider: ProviderType;
  /** Fetch the list of models from the provider API */
  fetchModels(apiKey: string): Promise<NormalizedModel[]>;
}

/** Repository for the provider-models Postgres cache */
export interface ProviderModelsCacheRepository {
  /** Return cached models for a provider if not older than `maxAgeMs` */
  get(provider: ProviderType, maxAgeMs: number): Promise<NormalizedModel[] | null>;
  /** Replace cache for a provider */
  set(provider: ProviderType, models: NormalizedModel[]): Promise<void>;
  /** Remove entries older than `maxAgeMs` */
  deleteExpired(maxAgeMs: number): Promise<number>;
}
