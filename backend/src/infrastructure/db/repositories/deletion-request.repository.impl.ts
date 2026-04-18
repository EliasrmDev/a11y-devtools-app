import { eq, and, count, desc } from "drizzle-orm";
import type { Database } from "../client.js";
import { deletionRequests } from "../schema/deletion-requests.js";
import type {
  DeletionRequestCreator,
  DeletionRequest,
} from "../../../application/use-cases/users/request-deletion.use-case.js";

export class DeletionRequestRepositoryImpl implements DeletionRequestCreator {
  constructor(private readonly db: Database) {}

  async create(userId: string, scheduledFor: Date): Promise<void> {
    await this.db.insert(deletionRequests).values({
      userId,
      scheduledFor,
      status: "pending",
    });
  }

  async findPendingByUser(
    userId: string,
  ): Promise<{ id: string } | null> {
    const rows = await this.db
      .select({ id: deletionRequests.id })
      .from(deletionRequests)
      .where(
        and(
          eq(deletionRequests.userId, userId),
          eq(deletionRequests.status, "pending"),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async cancel(id: string): Promise<void> {
    await this.db
      .update(deletionRequests)
      .set({ status: "cancelled" })
      .where(eq(deletionRequests.id, id));
  }

  async listAll(params: {
    page: number;
    limit: number;
    status?: string;
  }): Promise<{ data: DeletionRequest[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const condition = params.status
      ? eq(deletionRequests.status, params.status)
      : undefined;

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(deletionRequests)
        .where(condition)
        .orderBy(desc(deletionRequests.requestedAt))
        .limit(params.limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(deletionRequests)
        .where(condition),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        status: r.status,
        requestedAt: r.requestedAt,
        scheduledFor: r.scheduledFor,
        completedAt: r.completedAt ?? null,
        processedTables: (r.processedTables as Record<string, boolean>) ?? null,
        errorDetails: r.errorDetails ?? null,
      })),
      total: totalResult[0]?.count ?? 0,
    };
  }

  async findById(id: string): Promise<DeletionRequest | null> {
    const rows = await this.db
      .select()
      .from(deletionRequests)
      .where(eq(deletionRequests.id, id))
      .limit(1);

    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      userId: r.userId,
      status: r.status,
      requestedAt: r.requestedAt,
      scheduledFor: r.scheduledFor,
      completedAt: r.completedAt ?? null,
      processedTables: (r.processedTables as Record<string, boolean>) ?? null,
      errorDetails: r.errorDetails ?? null,
    };
  }

  async forceScheduleNow(id: string): Promise<void> {
    await this.db
      .update(deletionRequests)
      .set({ scheduledFor: new Date(), status: "pending" })
      .where(eq(deletionRequests.id, id));
  }
}
