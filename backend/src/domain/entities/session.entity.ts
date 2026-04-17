export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
  lastActiveAt: Date;
  revokedAt: Date | null;
}

export function isExpired(session: Session): boolean {
  return session.expiresAt < new Date();
}

export function isRevoked(session: Session): boolean {
  return session.revokedAt !== null;
}

export function isValid(session: Session): boolean {
  return !isExpired(session) && !isRevoked(session);
}
