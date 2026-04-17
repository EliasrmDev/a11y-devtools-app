import type { AuditRepository, AuditQueryParams } from "../../../domain/ports/audit.repository.js";

export interface AuditLogItem {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export class ViewAuditLogUseCase {
  constructor(private readonly audit: AuditRepository) {}

  async execute(
    params: AuditQueryParams,
  ): Promise<{ data: AuditLogItem[]; total: number }> {
    const result = await this.audit.findAll(params);

    return {
      data: result.data.map((e) => ({
        id: e.id,
        userId: e.userId,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        ipAddress: e.ipAddress,
        createdAt: e.createdAt.toISOString(),
      })),
      total: result.total,
    };
  }
}
