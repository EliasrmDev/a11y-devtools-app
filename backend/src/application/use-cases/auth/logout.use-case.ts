import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import type { RevokedTokenChecker } from "./refresh-token.use-case.js";
import type { JwtPayload } from "../../../shared/types.js";
import { sha256 } from "../../../infrastructure/crypto/hash.js";

export class LogoutUseCase {
  constructor(
    private readonly tokenChecker: RevokedTokenChecker,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    payload: JwtPayload,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    // Blacklist the current access token
    const jtiHash = sha256(payload.jti);
    await this.tokenChecker.revoke(
      jtiHash,
      payload.sub,
      "logout",
      new Date(payload.exp * 1000),
    );

    // Audit
    await this.audit.create({
      userId: payload.sub,
      action: "user.logout",
      resourceType: "user",
      resourceId: payload.sub,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }
}
