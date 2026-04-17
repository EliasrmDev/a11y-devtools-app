import type { UserRole } from "../../shared/types.js";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function isDeleted(user: User): boolean {
  return user.deletedAt !== null;
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}
