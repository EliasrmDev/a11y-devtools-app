export interface AuditRepository {
  create(data: CreateAuditData): Promise<void>;
  findByUser(userId: string, params: AuditQueryParams): Promise<AuditEvent[]>;
  findAll(params: AuditQueryParams): Promise<{ data: AuditEvent[]; total: number }>;
  nullifyUser(userId: string): Promise<number>;
}

export interface AuditEvent {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateAuditData {
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditQueryParams {
  page: number;
  limit: number;
  action?: string;
  resourceType?: string;
  since?: Date;
  until?: Date;
}
