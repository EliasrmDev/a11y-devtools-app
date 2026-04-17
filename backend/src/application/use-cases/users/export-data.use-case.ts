import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { UsageRepository } from "../../../domain/ports/usage.repository.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";
import { NotFoundError } from "../../../domain/errors/index.js";

export interface ExportedData {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
  };
  connections: Array<{
    id: string;
    providerType: string;
    label: string;
    baseUrl: string | null;
    createdAt: string;
  }>;
  usageStats: {
    totalRequests: number;
    totalTokens: number;
  };
  auditEvents: Array<{
    action: string;
    resourceType: string | null;
    createdAt: string;
  }>;
  exportedAt: string;
}

export class ExportDataUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly providers: ProviderRepository,
    private readonly usage: UsageRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    userId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<ExportedData> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError("User", userId);
    }

    const since = new Date(0); // all time
    const [connections, usageStats, auditEvents] = await Promise.all([
      this.providers.findByUser(userId),
      this.usage.getStats(userId, since),
      this.audit.findByUser(userId, { page: 1, limit: 10000 }),
    ]);

    // Audit the export itself
    await this.audit.create({
      userId,
      action: "user.data_exported",
      resourceType: "user",
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
      },
      connections: connections.map((c) => ({
        id: c.id,
        providerType: c.providerType,
        label: c.displayName,
        baseUrl: c.baseUrl,
        createdAt: c.createdAt.toISOString(),
      })),
      usageStats: {
        totalRequests: usageStats.totalRequests,
        totalTokens: usageStats.totalTokens,
      },
      auditEvents: auditEvents.map((e) => ({
        action: e.action,
        resourceType: e.resourceType,
        createdAt: e.createdAt.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
    };
  }
}
