import { eq, and, gte, lte, count, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { auditEvents } from "../schema/audit-events.js";
import type {
  AuditRepository,
  AuditEvent,
  CreateAuditData,
  AuditQueryParams,
} from "../../../domain/ports/audit.repository.js";

export class AuditRepositoryImpl implements AuditRepository {
  constructor(private readonly db: Database) {}

  async create(data: CreateAuditData): Promise<void> {
    await this.db.insert(auditEvents).values({
      userId: data.userId ?? null,
      action: data.action,
      resourceType: data.resourceType ?? null,
      resourceId: data.resourceId ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      metadata: data.metadata ?? null,
    });
  }

  async findByUser(
    userId: string,
    params: AuditQueryParams,
  ): Promise<AuditEvent[]> {
    const conditions = [eq(auditEvents.userId, userId)];
    if (params.action) conditions.push(eq(auditEvents.action, params.action));
    if (params.since) conditions.push(gte(auditEvents.createdAt, params.since));
    if (params.until) conditions.push(lte(auditEvents.createdAt, params.until));

    const offset = (params.page - 1) * params.limit;
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(and(...conditions))
      .orderBy(sql`${auditEvents.createdAt} DESC`)
      .limit(params.limit)
      .offset(offset);

    return rows.map(this.toDomain);
  }

  async findAll(
    params: AuditQueryParams,
  ): Promise<{ data: AuditEvent[]; total: number }> {
    const conditions = [];
    if (params.action) conditions.push(eq(auditEvents.action, params.action));
    if (params.resourceType)
      conditions.push(eq(auditEvents.resourceType, params.resourceType));
    if (params.since) conditions.push(gte(auditEvents.createdAt, params.since));
    if (params.until) conditions.push(lte(auditEvents.createdAt, params.until));

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (params.page - 1) * params.limit;

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(auditEvents)
        .where(whereClause)
        .orderBy(sql`${auditEvents.createdAt} DESC`)
        .limit(params.limit)
        .offset(offset),
      this.db.select({ count: count() }).from(auditEvents).where(whereClause),
    ]);

    return {
      data: rows.map(this.toDomain),
      total: totalResult[0]?.count ?? 0,
    };
  }

  async nullifyUser(userId: string): Promise<number> {
    const result = await this.db
      .update(auditEvents)
      .set({ userId: null })
      .where(eq(auditEvents.userId, userId));

    return result.rowCount ?? 0;
  }

  private toDomain(row: typeof auditEvents.$inferSelect): AuditEvent {
    return {
      id: row.id,
      userId: row.userId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }
}
