import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { revokedTokens } from "../schema/revoked-tokens.js";
import type { RevokedTokenChecker } from "../../../application/use-cases/auth/refresh-token.use-case.js";

/**
 * Implements the RevokedTokenChecker interface using the
 * revoked_tokens Drizzle table. Used by VerifyTokenUseCase,
 * RefreshTokenUseCase, and LogoutUseCase.
 */
export class RevokedTokenRepositoryImpl implements RevokedTokenChecker {
  constructor(private readonly db: Database) {}

  async isRevoked(jtiHash: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: revokedTokens.id })
      .from(revokedTokens)
      .where(eq(revokedTokens.tokenJti, jtiHash))
      .limit(1);

    return rows.length > 0;
  }

  async revoke(
    jtiHash: string,
    userId: string,
    reason: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db
      .insert(revokedTokens)
      .values({
        tokenJti: jtiHash,
        userId,
        reason,
        expiresAt,
      })
      .onConflictDoNothing({ target: revokedTokens.tokenJti });
  }
}
