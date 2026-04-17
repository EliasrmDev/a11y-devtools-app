import { sql } from "drizzle-orm";
import type { Database } from "../../../infrastructure/db/client.js";

export interface AdminStats {
  users: {
    total: number;
    active: number;
    admins: number;
    blocked: number;
  };
  connections: {
    total: number;
    active: number;
  };
  usage: {
    requestsLast30d: number;
    tokensLast30d: number;
  };
  jobs: {
    pending: number;
    running: number;
    failed: number;
    dead: number;
  };
}

export class GetAdminStatsUseCase {
  constructor(private readonly db: Database) {}

  async execute(): Promise<AdminStats> {
    const [userStats, connStats, usageStats, jobStats] = await Promise.all([
      this._userStats(),
      this._connStats(),
      this._usageStats(),
      this._jobStats(),
    ]);

    return { users: userStats, connections: connStats, usage: usageStats, jobs: jobStats };
  }

  private async _userStats() {
    const result = await this.db.execute<{
      total: string;
      active: string;
      admins: string;
      blocked: string;
    }>(sql`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL)          AS active,
        COUNT(*) FILTER (WHERE role = 'admin')               AS admins,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)       AS blocked
      FROM users
    `);

    const row = result.rows[0] ?? { total: "0", active: "0", admins: "0", blocked: "0" };
    return {
      total: Number(row.total),
      active: Number(row.active),
      admins: Number(row.admins),
      blocked: Number(row.blocked),
    };
  }

  private async _connStats() {
    const result = await this.db.execute<{ total: string; active: string }>(sql`
      SELECT
        COUNT(*)                                       AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE)       AS active
      FROM ai_provider_connections
    `);

    const row = result.rows[0] ?? { total: "0", active: "0" };
    return { total: Number(row.total), active: Number(row.active) };
  }

  private async _usageStats() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const result = await this.db.execute<{ requests: string; tokens: string }>(sql`
      SELECT
        COUNT(*)                    AS requests,
        COALESCE(SUM(total_tokens), 0) AS tokens
      FROM usage_events
      WHERE created_at >= ${since}
    `);

    const row = result.rows[0] ?? { requests: "0", tokens: "0" };
    return {
      requestsLast30d: Number(row.requests),
      tokensLast30d: Number(row.tokens),
    };
  }

  private async _jobStats() {
    const result = await this.db.execute<{
      pending: string;
      running: string;
      failed: string;
      dead: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE status = 'running')   AS running,
        COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
        COUNT(*) FILTER (WHERE status = 'dead')      AS dead
      FROM background_jobs
    `);

    const row = result.rows[0] ?? { pending: "0", running: "0", failed: "0", dead: "0" };
    return {
      pending: Number(row.pending),
      running: Number(row.running),
      failed: Number(row.failed),
      dead: Number(row.dead),
    };
  }
}
