import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import type { UpdateProfileInput, ProfileOutput } from "../../dto/user.dto.js";
import { NotFoundError } from "../../../domain/errors/index.js";

export class UpdateProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    userId: string,
    input: UpdateProfileInput,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<ProfileOutput> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError("User", userId);
    }

    const updated = await this.users.update(userId, {
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
    });

    await this.audit.create({
      userId,
      action: "user.profile_updated",
      resourceType: "user",
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      role: updated.role,
      emailVerifiedAt: updated.emailVerifiedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}
