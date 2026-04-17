import { eq, and, isNull, count } from "drizzle-orm";
import type { Database } from "../client.js";
import { users } from "../schema/users.js";
import type { User } from "../../../domain/entities/user.entity.js";
import type {
  UserRepository,
  CreateUserData,
  UpdateUserData,
} from "../../../domain/ports/user.repository.js";
import type { PaginationParams, PaginatedResult, UserRole } from "../../../shared/types.js";

export class UserRepositoryImpl implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async create(data: CreateUserData): Promise<User> {
    const rows = await this.db
      .insert(users)
      .values({
        email: data.email,
        displayName: data.displayName ?? null,
        avatarUrl: data.avatarUrl ?? null,
        role: data.role ?? "user",
        emailVerifiedAt: data.emailVerifiedAt ?? null,
      })
      .returning();

    return this.toDomain(rows[0]);
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    const rows = await this.db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return this.toDomain(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async restore(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }

  async list(
    params: PaginationParams & { role?: UserRole },
  ): Promise<PaginatedResult<User>> {
    const offset = (params.page - 1) * params.limit;
    const conditions = [isNull(users.deletedAt)];

    if (params.role) {
      conditions.push(eq(users.role, params.role));
    }

    const whereClause = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(whereClause)
        .limit(params.limit)
        .offset(offset)
        .orderBy(users.createdAt),
      this.db
        .select({ count: count() })
        .from(users)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: rows.map(this.toDomain),
      total,
      page: params.page,
      limit: params.limit,
      hasMore: offset + rows.length < total,
    };
  }

  private toDomain(row: typeof users.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      role: row.role as User["role"],
      emailVerifiedAt: row.emailVerifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
