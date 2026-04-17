import { eq, and } from "drizzle-orm";
import type { Database } from "../client.js";
import { deletionRequests } from "../schema/deletion-requests.js";
import type { DeletionRequestCreator } from "../../../application/use-cases/users/request-deletion.use-case.js";

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
}
