import type { Database } from "../db/client.js";
import type { Logger } from "../logging/logtail.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { JobQueue } from "./job-queue.js";
import {
  cleanupExpiredTokens,
  cleanupExpiredSessions,
} from "./handlers/cleanup-expired-tokens.js";
import { processDeletionRequests } from "./handlers/process-deletion.js";
import { cleanupOldUsageEvents } from "./handlers/cleanup-usage-events.js";
import { remindKeyRotation } from "./handlers/reminder-key-rotation.js";
import { remindInvalidCredential } from "./handlers/reminder-invalid-credential.js";
import { cleanupSoftDeleted } from "./handlers/cleanup-soft-deleted.js";
import { detectInactiveAccounts } from "./handlers/detect-inactive-accounts.js";
import { cleanupExpiredModelCache } from "./handlers/cleanup-model-cache.js";

/**
 * Cron-triggered batch processor (fires every minute via CF Workers cron).
 *
 * Uses the job queue to dispatch work.  Each invocation:
 *   1. Enqueues any newly scheduled/recurring jobs that should run now.
 *   2. Dequeues and executes pending jobs from the background_jobs table.
 *   3. Runs lightweight inline tasks that run on every tick (token cleanup, etc.).
 */
export async function processScheduledJobs(
  db: Database,
  notifications: NotificationService,
  logger: Logger,
  opts?: { neonAuthBaseUrl?: string },
): Promise<void> {
  const start = Date.now();
  logger.info("Starting scheduled job processing");

  const queue = new JobQueue(db);

  try {
    // Enqueue recurring jobs using idempotent scheduling
    // (uniqueKey ensures no double-enqueue within the same minute slot)
    const nowMinute = Math.floor(Date.now() / 60_000).toString();

    await queue.scheduleIfNotExists(
      "REMINDER_KEY_ROTATION",
      `hourly:${Math.floor(Date.now() / 3_600_000)}`,
      {},
      new Date(),
    );

    await queue.scheduleIfNotExists(
      "REMINDER_INVALID_CREDENTIAL",
      `hourly:${Math.floor(Date.now() / 3_600_000)}`,
      {},
      new Date(),
    );

    await queue.scheduleIfNotExists(
      "CLEANUP_EXPIRED_TOKENS",
      `tick:${nowMinute}`,
      {},
      new Date(),
    );

    await queue.scheduleIfNotExists(
      "CLEANUP_SOFT_DELETED",
      `daily:${Math.floor(Date.now() / 86_400_000)}`,
      {},
      new Date(),
    );

    await queue.scheduleIfNotExists(
      "PROCESS_DELETION_REQUESTS",
      `tick:${nowMinute}`,
      {},
      new Date(),
    );

    await queue.scheduleIfNotExists(
      "DETECT_INACTIVE_ACCOUNTS",
      `daily:${Math.floor(Date.now() / 86_400_000)}`,
      {},
      new Date(),
    );

    await queue.scheduleIfNotExists(
      "CLEANUP_EXPIRED_MODEL_CACHE",
      `daily:${Math.floor(Date.now() / 86_400_000)}`,
      {},
      new Date(),
    );

    // Dequeue and execute up to 10 pending jobs
    const jobs = await queue.dequeueNextBatch(10);
    logger.info("Processing queued jobs", { count: jobs.length });

    for (const job of jobs) {
      try {
        await dispatchJob(job.name, db, notifications, logger, opts);
        await queue.complete(job.id);
        logger.info("Job completed", { jobId: job.id, name: job.name });
      } catch (error) {
        await queue.fail(job.id, error);
        logger.error("Job failed", {
          jobId: job.id,
          name: job.name,
          attempt: job.attempts,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Purge completed/dead jobs older than 1 days to prevent unbounded growth
    const purged = await queue.purge(1);
    if (purged > 0) {
      logger.info("Purged old completed jobs", { count: purged });
    }

    logger.info("Scheduled job processing completed", {
      durationMs: Date.now() - start,
    });
  } catch (error) {
    logger.error("Scheduled job processing failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - start,
    });
  }
}

async function dispatchJob(
  name: string,
  db: Database,
  notifications: NotificationService,
  logger: Logger,
  opts?: { neonAuthBaseUrl?: string },
): Promise<void> {
  switch (name) {
    case "REMINDER_KEY_ROTATION":
      await remindKeyRotation(db, notifications, logger);
      break;

    case "REMINDER_INVALID_CREDENTIAL":
      await remindInvalidCredential(db, notifications, logger);
      break;

    case "CLEANUP_EXPIRED_TOKENS":
      await cleanupExpiredTokens(db, logger);
      await cleanupExpiredSessions(db, logger);
      break;

    case "CLEANUP_SOFT_DELETED":
      await cleanupSoftDeleted(db, logger, opts?.neonAuthBaseUrl);
      break;

    case "PROCESS_DELETION_REQUESTS":
      await processDeletionRequests(db, logger, notifications, opts?.neonAuthBaseUrl);
      break;

    case "CLEANUP_USAGE_EVENTS":
      await cleanupOldUsageEvents(db, logger);
      break;

    case "DETECT_INACTIVE_ACCOUNTS":
      await detectInactiveAccounts(db, notifications, logger);
      break;

    case "CLEANUP_EXPIRED_MODEL_CACHE":
      await cleanupExpiredModelCache(db, logger);
      break;

    default:
      logger.warn("Unknown job name — skipped", { name });
  }
}

