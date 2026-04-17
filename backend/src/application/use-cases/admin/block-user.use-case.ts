import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";

export interface BlockUserInput {
  targetUserId: string;
  adminUserId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UnblockUserInput {
  targetUserId: string;
  adminUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

export class BlockUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly audit: AuditRepository,
  ) {}

  async block(input: BlockUserInput): Promise<void> {
    const user = await this.users.findById(input.targetUserId);
    if (!user) throw new Error("User not found");
    if (user.deletedAt) throw new Error("User is already blocked or deleted");

    // Soft-delete re-used as a block mechanism (sets deletedAt)
    await this.users.softDelete(input.targetUserId);

    await this.audit.create({
      userId: input.adminUserId,
      action: "admin.user.block",
      resourceType: "user",
      resourceId: input.targetUserId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { reason: input.reason },
    });
  }

  async unblock(input: UnblockUserInput): Promise<void> {
    const user = await this.users.findById(input.targetUserId);
    if (!user) throw new Error("User not found");
    if (!user.deletedAt) throw new Error("User is not blocked");

    await this.users.restore(input.targetUserId);

    await this.audit.create({
      userId: input.adminUserId,
      action: "admin.user.unblock",
      resourceType: "user",
      resourceId: input.targetUserId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
