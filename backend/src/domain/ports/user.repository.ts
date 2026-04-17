import type { User } from "../entities/user.entity.js";
import type { PaginationParams, PaginatedResult, UserRole } from "../../shared/types.js";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
  list(params: PaginationParams & { role?: UserRole }): Promise<PaginatedResult<User>>;
}

export interface CreateUserData {
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: UserRole;
  emailVerifiedAt?: Date | null;
}

export interface UpdateUserData {
  displayName?: string | null;
  avatarUrl?: string | null;
  emailVerifiedAt?: Date | null;
}
