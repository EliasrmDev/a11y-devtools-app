import type { AuthPort } from "../../../domain/ports/auth.port.js";
import type { JwtPayload } from "../../../shared/types.js";
import type { RevokedTokenChecker } from "./refresh-token.use-case.js";
import { UnauthorizedError } from "../../../domain/errors/index.js";
import { sha256 } from "../../../infrastructure/crypto/hash.js";

export class VerifyTokenUseCase {
  constructor(
    private readonly auth: AuthPort,
    private readonly tokenChecker: RevokedTokenChecker,
  ) {}

  async execute(token: string): Promise<JwtPayload> {
    // 1. Verify JWT signature and expiration
    const payload = await this.auth.verifyAccessToken(token);

    // 2. Check blacklist
    const jtiHash = sha256(payload.jti);
    if (await this.tokenChecker.isRevoked(jtiHash)) {
      throw new UnauthorizedError("Token has been revoked");
    }

    return payload;
  }
}
