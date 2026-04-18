import { sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { backgroundJobs } from "../db/schema/background-jobs.js";
import { eq, and } from "drizzle-orm";

export const JOB_NAMES = [
  "REMINDER_KEY_ROTATION",
  "REMINDER_INVALID_CREDENTIAL",
  "CLEANUP_EXPIRED_TOKENS",
  "CLEANUP_SOFT_DELETED",
  "PROCESS_DELETION_REQUESTS",
  "DETECT_INACTIVE_ACCOUNTS",
  "CLEANUP_EXPIRED_MODEL_CACHE",
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export interface BackgroundJob {
  id: string;
  name: string;
  payload: Record<string, unknown> | null;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  uniqueKey: string | null;
  runAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  createdAt: Date;
}

export interface EnqueueOptions {
  /** ISO timestamp or Date — defaults to now */
  runAt?: Date;
  priority?: number;
  maxAttempts?: number;
  /**
   * When set, duplicate enqueues with the same key are silently ignored.
   * Useful for idempotent scheduling (e.g. "at most one scan per hour").
   */
  uniqueKey?: string;
}

/**
 * Lightweight pg-boss–style job queue backed by Neon Postgres.
 *
 * Uses an atomic `UPDATE ... WHERE status = 'pending' ... RETURNING *`
 * to safely claim jobs without `FOR UPDATE SKIP LOCKED` (unnecessary for
 * single-concurrency CF Workers cron invocations).
 */
export class JobQueue {
  constructor(private readonly db: Database) {}

  /**
   * Add a new job to the queue. Returns the new job id.
   * If `uniqueKey` is given and a pending/running job with that key already
   * exists, this is a no-op (returns the existing job id).
   */
  async enqueue(
    name: JobName,
    payload: Record<string, unknown> = {},
    opts: EnqueueOptions = {},
  ): Promise<string> {
    if (opts.uniqueKey) {
      const existing = await this.db
        .select({ id: backgroundJobs.id })
        .from(backgroundJobs)
        .where(
          and(
            eq(backgroundJobs.uniqueKey, opts.uniqueKey),
            sql`${backgroundJobs.status} IN ('pending', 'running')`,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return existing[0].id;
      }
    }

    const [job] = await this.db
      .insert(backgroundJobs)
      .values({
        name,
        payload,
        status: "pending",
        priority: opts.priority ?? 0,
        maxAttempts: opts.maxAttempts ?? 3,
        uniqueKey: opts.uniqueKey ?? null,
        runAt: opts.runAt ?? new Date(),
      })
      .returning({ id: backgroundJobs.id });

    return job.id;
  }

  /**
   * Atomically claims up to `limit` due pending jobs by setting their
   * status to `running`. Returns claimed jobs for processing.
   */
  async dequeueNextBatch(limit = 5): Promise<BackgroundJob[]> {
    // Atomic claim: find pending jobs due now, mark them running in one shot
    const result = await this.db.execute(sql`
      UPDATE background_jobs
      SET
        status      = 'running',
        started_at  = NOW(),
        attempts    = attempts + 1
      WHERE id IN (
        SELECT id
        FROM background_jobs
        WHERE status = 'pending'
          AND run_at <= NOW()
        ORDER BY priority DESC, run_at ASC
        LIMIT ${limit}
      )
      RETURNING
        id, name, payload, status, priority, attempts, max_attempts,
        unique_key, run_at, started_at, completed_at, error, created_at
    `);

    return result.rows.map(rowToJob);
  }

  /** Mark a running job as completed. */
  async complete(id: string): Promise<void> {
    await this.db
      .update(backgroundJobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(backgroundJobs.id, id));
  }

  /**
   * Mark a running job as failed.
   * If `attempts < max_attempts`, reschedule with exponential back-off.
   * Otherwise, move to `dead`.
   */
  async fail(id: string, error: unknown): Promise<void> {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");

    const [job] = await this.db
      .select({
        attempts: backgroundJobs.attempts,
        maxAttempts: backgroundJobs.maxAttempts,
      })
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, id));

    if (!job) return;

    if (job.attempts < job.maxAttempts) {
      // Exponential back-off: 2^attempts minutes
      const backoffMinutes = Math.pow(2, job.attempts);
      const runAt = new Date(Date.now() + backoffMinutes * 60_000);

      await this.db
        .update(backgroundJobs)
        .set({ status: "pending", error: message, runAt })
        .where(eq(backgroundJobs.id, id));
    } else {
      await this.db
        .update(backgroundJobs)
        .set({ status: "dead", error: message })
        .where(eq(backgroundJobs.id, id));
    }
  }

  /** List jobs, optionally filtered by name and/or status. */
  async list(filter?: { name?: string; status?: string }): Promise<BackgroundJob[]> {
    const conditions = [];

    if (filter?.name) {
      conditions.push(eq(backgroundJobs.name, filter.name));
    }
    if (filter?.status) {
      conditions.push(eq(backgroundJobs.status, filter.status));
    }

    const rows = await this.db
      .select()
      .from(backgroundJobs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sql`created_at DESC`)
      .limit(200);

    return rows.map(rowToJob);
  }

  /**
   * Immediately schedule all pending jobs with the given name to run now.
   * Used by the admin "run job now" endpoint.
   */
  async runNow(name: JobName): Promise<number> {
    const result = await this.db
      .update(backgroundJobs)
      .set({ runAt: new Date() })
      .where(and(eq(backgroundJobs.name, name), eq(backgroundJobs.status, "pending")));

    return result.rowCount ?? 0;
  }

  /**
   * Schedule a recurring job to run at `runAt`. Deduplicates using
   * `uniqueKey = "${name}:${uniqueSuffix}"`.
   */
  async scheduleIfNotExists(
    name: JobName,
    uniqueSuffix: string,
    payload: Record<string, unknown> = {},
    runAt: Date = new Date(),
  ): Promise<void> {
    await this.enqueue(name, payload, {
      uniqueKey: `${name}:${uniqueSuffix}`,
      runAt,
    });
  }
}

// --- helpers ---

function rowToJob(row: Record<string, unknown>): BackgroundJob {
  return {
    id: row.id as string,
    name: row.name as string,
    payload: (row.payload ?? null) as Record<string, unknown> | null,
    status: row.status as string,
    priority: Number(row.priority ?? 0),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    uniqueKey: (row.unique_key ?? null) as string | null,
    runAt: new Date(row.run_at as string),
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    error: (row.error ?? null) as string | null,
    createdAt: new Date(row.created_at as string),
  };
}
