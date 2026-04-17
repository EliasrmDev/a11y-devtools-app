/**
 * Job handler idempotency tests.
 *
 * Each handler must be safe to call multiple times with the same data
 * (at-least-once delivery semantics from the cron queue). These tests
 * verify that re-running handlers does not cause duplicate side-effects.
 */
import { describe, it, expect, vi } from "vitest";
import { cleanupExpiredTokens } from "../src/infrastructure/jobs/handlers/cleanup-expired-tokens.js";
import type { Database } from "../src/infrastructure/db/client.js";
import type { Logger } from "../src/infrastructure/logging/logtail.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeDb(deleteRowCount = 0): Database {
  return {
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: deleteRowCount }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// cleanupExpiredTokens — idempotency
// ---------------------------------------------------------------------------

describe("cleanupExpiredTokens handler", () => {
  it("returns the number of deleted rows", async () => {
    const db = makeDb(5);
    const logger = mockLogger();
    const count = await cleanupExpiredTokens(db, logger);
    expect(count).toBe(5);
  });

  it("returns 0 when there is nothing to clean up (idempotent no-op)", async () => {
    const db = makeDb(0);
    const logger = mockLogger();
    const count = await cleanupExpiredTokens(db, logger);
    expect(count).toBe(0);
  });

  it("executes exactly one DELETE statement per call", async () => {
    const db = makeDb(3);
    const logger = mockLogger();
    await cleanupExpiredTokens(db, logger);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("logs the cleaned-up count at info level", async () => {
    const db = makeDb(2);
    const logger = mockLogger();
    await cleanupExpiredTokens(db, logger);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("expired"),
      expect.objectContaining({ count: 2 }),
    );
  });

  it("is safe to call twice in sequence (idempotent)", async () => {
    const db = makeDb(0);
    const logger = mockLogger();
    // Second run should also succeed with no errors
    await cleanupExpiredTokens(db, logger);
    await cleanupExpiredTokens(db, logger);
    expect(db.delete).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// JobQueue.enqueue uniqueKey — prevents duplicate scheduling
// ---------------------------------------------------------------------------

import { JobQueue } from "../src/infrastructure/jobs/job-queue.js";

describe("JobQueue idempotency via uniqueKey", () => {
  function makeJobDb(existingId: string | null = null) {
    const existingRows = existingId ? [{ id: existingId }] : [];
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(existingRows),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "new-job-id" }]),
        }),
      }),
    } as unknown as Database;
  }

  it("creates a new job when no pending job with that uniqueKey exists", async () => {
    const db = makeJobDb(null);
    const queue = new JobQueue(db);
    const id = await queue.enqueue(
      "CLEANUP_EXPIRED_TOKENS",
      {},
      { uniqueKey: "cleanup:tokens:daily" },
    );
    expect(id).toBe("new-job-id");
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("returns the existing job id without inserting a duplicate", async () => {
    const db = makeJobDb("existing-job-id");
    const queue = new JobQueue(db);
    const id = await queue.enqueue(
      "CLEANUP_EXPIRED_TOKENS",
      {},
      { uniqueKey: "cleanup:tokens:daily" },
    );
    expect(id).toBe("existing-job-id");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("allows inserting without a uniqueKey (no dedup logic)", async () => {
    const db = makeJobDb(null);
    const queue = new JobQueue(db);
    await queue.enqueue("CLEANUP_EXPIRED_TOKENS", {});
    // select should NOT have been called for deduplication
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledOnce();
  });
});
