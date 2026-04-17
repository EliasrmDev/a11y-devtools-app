import { eq, and, lt, isNull } from "drizzle-orm";
import type { Database } from "../client.js";
import { sessions } from "../schema/sessions.js";
import type { Session } from "../../../domain/entities/session.entity.js";
import type {
  SessionRepository,
  CreateSessionData,
} from "../../../domain/ports/session.repository.js";

export class SessionRepositoryImpl implements SessionRepository {
  constructor(private readonly db: Database) {}

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    return rows.map(this.toDomain);
  }

  async create(data: CreateSessionData): Promise<Session> {
    const rows = await this.db
      .insert(sessions)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        expiresAt: data.expiresAt,
      })
      .returning();

    return this.toDomain(rows[0]);
  }

  async updateLastActive(id: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.id, id));
  }

  async revoke(id: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, id));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    const result = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now));

    return result.rowCount ?? 0;
  }

  private toDomain(row: typeof sessions.$inferSelect): Session {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      lastActiveAt: row.lastActiveAt,
      revokedAt: row.revokedAt,
    };
  }
}
