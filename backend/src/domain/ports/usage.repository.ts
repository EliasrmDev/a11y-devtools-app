import type { UsageEvent } from "../entities/usage-event.entity.js";
import type { UsageStatus } from "../../shared/types.js";

export interface UsageRepository {
  create(data: CreateUsageData): Promise<void>;
  findByUser(userId: string, params: UsageQueryParams): Promise<{ data: UsageEvent[]; total: number }>;
  deleteOlderThan(date: Date): Promise<number>;
  deleteByUser(userId: string): Promise<number>;
  getStats(userId: string, since: Date): Promise<UsageStats>;
}

export interface CreateUsageData {
  userId: string;
  connectionId?: string | null;
  modelId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  status: UsageStatus;
  errorCode?: string | null;
}

export interface UsageQueryParams {
  page: number;
  limit: number;
  since?: Date;
  until?: Date;
  connectionId?: string;
  status?: UsageStatus;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  avgLatencyMs: number;
  successRate: number;
}
