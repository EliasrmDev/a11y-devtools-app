import type { AuthPort } from "../../../domain/ports/auth.port.js";
import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import type { TokenPairOutput } from "../../dto/auth.dto.js";

export class LoginUseCase {
  constructor(
    private readonly auth: AuthPort,
    private readonly users: UserRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    externalToken: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<TokenPairOutput> {
    // 1. Verify external OAuth token
    const externalUser = await this.auth.verifyExternalToken(externalToken);

    // 2. Find or create user
    let user = await this.users.findByEmail(externalUser.email);

    if (!user) {
      user = await this.users.create({
        email: externalUser.email,
        displayName: externalUser.displayName,
        avatarUrl: externalUser.avatarUrl,
        emailVerifiedAt: externalUser.emailVerified ? new Date() : null,
      });
    }

    // 3. Create JWT pair
    const tokenPair = await this.auth.createTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // 4. Audit
    await this.audit.create({
      userId: user.id,
      action: "user.login",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { provider: externalUser.provider },
    });

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }
}
