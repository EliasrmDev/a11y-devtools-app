import type { Session } from "../entities/session.entity.js";

export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  findByUserId(userId: string): Promise<Session[]>;
  create(data: CreateSessionData): Promise<Session>;
  updateLastActive(id: string): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

export interface CreateSessionData {
  userId: string;
  tokenHash: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}
