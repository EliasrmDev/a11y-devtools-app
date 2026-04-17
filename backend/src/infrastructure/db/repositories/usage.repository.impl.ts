import { eq, and, gte, lte, lt, count, sql, avg, sum } from "drizzle-orm";
import type { Database } from "../client.js";
import { usageEvents } from "../schema/usage-events.js";
import type { UsageEvent } from "../../../domain/entities/usage-event.entity.js";
import type {
  UsageRepository,
  CreateUsageData,
  UsageQueryParams,
  UsageStats,
} from "../../../domain/ports/usage.repository.js";

export class UsageRepositoryImpl implements UsageRepository {
  constructor(private readonly db: Database) {}

  async create(data: CreateUsageData): Promise<void> {
    await this.db.insert(usageEvents).values({
      userId: data.userId,
      connectionId: data.connectionId ?? null,
      modelId: data.modelId ?? null,
      promptTokens: data.promptTokens ?? null,
      completionTokens: data.completionTokens ?? null,
      totalTokens: data.totalTokens ?? null,
      latencyMs: data.latencyMs ?? null,
      status: data.status,
      errorCode: data.errorCode ?? null,
    });
  }

  async findByUser(
    userId: string,
    params: UsageQueryParams,
  ): Promise<{ data: UsageEvent[]; total: number }> {
    const conditions = [eq(usageEvents.userId, userId)];
    if (params.since) conditions.push(gte(usageEvents.createdAt, params.since));
    if (params.until) conditions.push(lte(usageEvents.createdAt, params.until));
    if (params.connectionId)
      conditions.push(eq(usageEvents.connectionId, params.connectionId));
    if (params.status) conditions.push(eq(usageEvents.status, params.status));

    const whereClause = and(...conditions);
    const offset = (params.page - 1) * params.limit;

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(usageEvents)
        .where(whereClause)
        .orderBy(sql`${usageEvents.createdAt} DESC`)
        .limit(params.limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(usageEvents)
        .where(whereClause),
    ]);

    return {
      data: rows.map(this.toDomain),
      total: totalResult[0]?.count ?? 0,
    };
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.db
      .delete(usageEvents)
      .where(lt(usageEvents.createdAt, date));

    return result.rowCount ?? 0;
  }

  async deleteByUser(userId: string): Promise<number> {
    const result = await this.db
      .delete(usageEvents)
      .where(eq(usageEvents.userId, userId));

    return result.rowCount ?? 0;
  }

  async getStats(userId: string, since: Date): Promise<UsageStats> {
    const rows = await this.db
      .select({
        totalRequests: count(),
        totalTokens: sum(usageEvents.totalTokens),
        avgLatency: avg(usageEvents.latencyMs),
        successCount: sql<number>`count(*) filter (where ${usageEvents.status} = 'success')`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          gte(usageEvents.createdAt, since),
        ),
      );

    const row = rows[0];
    const totalRequests = row?.totalRequests ?? 0;

    return {
      totalRequests,
      totalTokens: Number(row?.totalTokens ?? 0),
      avgLatencyMs: Math.round(Number(row?.avgLatency ?? 0)),
      successRate:
        totalRequests > 0
          ? Number(row?.successCount ?? 0) / totalRequests
          : 0,
    };
  }

  private toDomain(row: typeof usageEvents.$inferSelect): UsageEvent {
    return {
      id: row.id,
      userId: row.userId,
      connectionId: row.connectionId,
      modelId: row.modelId,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      latencyMs: row.latencyMs,
      status: row.status as UsageEvent["status"],
      errorCode: row.errorCode,
      createdAt: row.createdAt,
    };
  }
}
