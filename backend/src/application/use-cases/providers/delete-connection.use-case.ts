import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import { NotFoundError } from "../../../domain/errors/index.js";

export class DeleteConnectionUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    userId: string,
    connectionId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const connection = await this.providers.findByIdAndUser(
      connectionId,
      userId,
    );
    if (!connection) {
      throw new NotFoundError("Provider connection", connectionId);
    }

    // CASCADE deletes encrypted_secrets automatically
    await this.providers.delete(connectionId);

    await this.audit.create({
      userId,
      action: "provider.deleted",
      resourceType: "provider",
      resourceId: connectionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { providerType: connection.providerType },
    });
  }
}
