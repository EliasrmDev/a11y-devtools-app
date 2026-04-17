import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import type { EmailPort } from "../../../domain/ports/email.port.js";
import { NotFoundError, ConflictError } from "../../../domain/errors/index.js";
import { RETENTION } from "../../../shared/constants.js";

export interface DeletionRequestCreator {
  create(userId: string, scheduledFor: Date): Promise<void>;
  findPendingByUser(userId: string): Promise<{ id: string } | null>;
  cancel(id: string): Promise<void>;
}

export class RequestDeletionUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly deletions: DeletionRequestCreator,
    private readonly audit: AuditRepository,
    private readonly email: EmailPort,
  ) {}

  async execute(
    userId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<{ scheduledFor: string }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError("User", userId);
    }

    // Check for existing pending deletion
    const existing = await this.deletions.findPendingByUser(userId);
    if (existing) {
      throw new ConflictError("A deletion request is already pending");
    }

    // Schedule deletion after grace period
    const scheduledFor = new Date();
    scheduledFor.setDate(
      scheduledFor.getDate() + RETENTION.DELETION_GRACE_DAYS,
    );

    // Soft delete user immediately
    await this.users.softDelete(userId);

    // Create deletion request
    await this.deletions.create(userId, scheduledFor);

    // Audit
    await this.audit.create({
      userId,
      action: "user.deletion_requested",
      resourceType: "user",
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { scheduledFor: scheduledFor.toISOString() },
    });

    // Send confirmation email
    await this.email.send({
      to: user.email,
      subject: "Account Deletion Scheduled — a11y DevTools",
      html: `
        <p>Your account deletion has been scheduled for ${scheduledFor.toLocaleDateString()}.</p>
        <p>You have ${RETENTION.DELETION_GRACE_DAYS} days to cancel this request by logging in.</p>
        <p>After this date, all your data will be permanently deleted.</p>
      `,
    });

    return { scheduledFor: scheduledFor.toISOString() };
  }
}

export class CancelDeletionUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly deletions: DeletionRequestCreator,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    userId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const pending = await this.deletions.findPendingByUser(userId);
    if (!pending) {
      throw new NotFoundError("Pending deletion request");
    }

    await this.deletions.cancel(pending.id);
    await this.users.restore(userId);

    await this.audit.create({
      userId,
      action: "user.deletion_cancelled",
      resourceType: "user",
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }
}
