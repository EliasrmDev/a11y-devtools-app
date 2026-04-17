import type { TokenPair, JwtPayload } from "../../shared/types.js";

export interface AuthPort {
  /** Verify an external OAuth token (from Clerk or Better Auth) and return user info */
  verifyExternalToken(token: string): Promise<ExternalAuthResult>;

  /** Create a JWT pair (access + refresh) for authenticated user */
  createTokenPair(payload: Pick<JwtPayload, "sub" | "email" | "role">): Promise<TokenPair>;

  /** Verify and decode an access token, checking blacklist */
  verifyAccessToken(token: string): Promise<JwtPayload>;

  /** Verify a refresh token and return its payload */
  verifyRefreshToken(token: string): Promise<JwtPayload>;
}

export interface ExternalAuthResult {
  externalId: string;
  provider: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}
