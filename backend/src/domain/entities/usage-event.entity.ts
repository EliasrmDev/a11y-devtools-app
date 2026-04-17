import type { UsageStatus } from "../../shared/types.js";

export interface UsageEvent {
  id: string;
  userId: string;
  connectionId: string | null;
  modelId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  status: UsageStatus;
  errorCode: string | null;
  createdAt: Date;
}
