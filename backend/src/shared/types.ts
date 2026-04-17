export type ProviderType = "openai" | "anthropic" | "openrouter" | "gemini" | "groq" | "cloudflare" | "custom";

/** Minimal interface for the Cloudflare Workers AI binding (`env.AI`) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AiBinding = { run(model: string, input: Record<string, unknown>): Promise<any> };

export type UserRole = "user" | "admin";

export type DeletionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type ReminderStatus = "active" | "paused" | "completed";

export type UsageStatus = "success" | "error" | "timeout";

export type TokenRevokeReason = "logout" | "refresh_rotation" | "security";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  jti: string; // unique token id
  iat: number;
  exp: number;
  aud: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
