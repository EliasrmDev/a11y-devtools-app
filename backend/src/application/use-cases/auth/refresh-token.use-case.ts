import type { AuthPort } from "../../../domain/ports/auth.port.js";
import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { TokenPair } from "../../../shared/types.js";
import { UnauthorizedError } from "../../../domain/errors/index.js";
import { sha256 } from "../../../infrastructure/crypto/hash.js";

export interface RevokedTokenChecker {
  isRevoked(jti: string): Promise<boolean>;
  revoke(jti: string, userId: string, reason: string, expiresAt: Date): Promise<void>;
}

export class RefreshTokenUseCase {
  constructor(
    private readonly auth: AuthPort,
    private readonly users: UserRepository,
    private readonly tokenChecker: RevokedTokenChecker,
  ) {}

  async execute(refreshToken: string): Promise<TokenPair> {
    // 1. Verify refresh token
    const payload = await this.auth.verifyRefreshToken(refreshToken);

    // 2. Check blacklist
    const jtiHash = sha256(payload.jti);
    if (await this.tokenChecker.isRevoked(jtiHash)) {
      throw new UnauthorizedError("Refresh token has been revoked");
    }

    // 3. Verify user still exists and is active
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    // 4. Revoke old refresh token (rotation)
    await this.tokenChecker.revoke(
      jtiHash,
      user.id,
      "refresh_rotation",
      new Date(payload.exp * 1000),
    );

    // 5. Issue new token pair
    return this.auth.createTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}
