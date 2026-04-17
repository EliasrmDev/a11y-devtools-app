import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { PaginationParams, PaginatedResult, UserRole } from "../../../shared/types.js";

export interface UserListItem {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: string;
  deletedAt: string | null;
}

export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(
    params: PaginationParams & { role?: UserRole },
  ): Promise<PaginatedResult<UserListItem>> {
    const result = await this.users.list(params);

    return {
      data: result.data.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        deletedAt: u.deletedAt?.toISOString() ?? null,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
    };
  }
}
