import type { AuthPort } from "../../../domain/ports/auth.port.js";
import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import type { DeletionRequestCreator } from "../users/request-deletion.use-case.js";
import type { TokenPairOutput } from "../../dto/auth.dto.js";
import type { Database } from "../../../infrastructure/db/client.js";
import { identities } from "../../../infrastructure/db/schema/identities.js";

export class LoginUseCase {
  constructor(
    private readonly auth: AuthPort,
    private readonly users: UserRepository,
    private readonly audit: AuditRepository,
    private readonly db: Database,
    private readonly deletions: DeletionRequestCreator,
  ) {}

  async execute(
    externalToken: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<TokenPairOutput> {
    // 1. Verify external OAuth token
    const externalUser = await this.auth.verifyExternalToken(externalToken);

    // 2. Find or create user (including soft-deleted users to prevent duplicates)
    let user = await this.users.findByEmailIncludingDeleted(externalUser.email);

    if (!user) {
      user = await this.users.create({
        ...(externalUser.provider === "neon-auth" ? { id: externalUser.externalId } : {}),
        email: externalUser.email,
        displayName: externalUser.displayName,
        avatarUrl: externalUser.avatarUrl,
        emailVerifiedAt: externalUser.emailVerified ? new Date() : null,
      });
    } else if (user.deletedAt) {
      // User was soft-deleted (pending deletion) — restore on login
      await this.users.restore(user.id);
      await this.deletions.cancelByUserId(user.id);
      await this.audit.create({
        userId: user.id,
        action: "user.restored_on_login",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { provider: externalUser.provider },
      });
      // Re-fetch to get the restored state
      user = (await this.users.findByEmail(externalUser.email))!;
    } else if (externalUser.provider === "neon-auth") {
      // User exists but might not have Neon Auth identity - ensure it's created/updated
      await this.db
        .insert(identities)
        .values({
          userId: user.id,
          provider: "neon-auth",
          providerAccountId: externalUser.externalId,
          providerEmail: externalUser.email,
        })
        .onConflictDoUpdate({
          target: [identities.provider, identities.providerAccountId],
          set: {
            providerEmail: externalUser.email,
            updatedAt: new Date(),
          },
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
