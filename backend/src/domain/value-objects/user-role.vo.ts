import type { UserRole } from "../../shared/types.js";

const VALID_ROLES: ReadonlySet<string> = new Set<UserRole>(["user", "admin"]);

export function isValidUserRole(value: string): value is UserRole {
  return VALID_ROLES.has(value);
}
