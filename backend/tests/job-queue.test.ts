import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobQueue, type BackgroundJob } from "../src/infrastructure/jobs/job-queue.js";
import type { Database } from "../src/infrastructure/db/client.js";

// ─── Mock DB ─────────────────────────────────────────────────────────────────

function makeDb(overrides: Partial<Database> = {}): Database {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "job-uuid-1" }]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    }),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    ...overrides,
  } as unknown as Database;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("JobQueue.enqueue", () => {
  it("inserts a new job and returns its id", async () => {
    const db = makeDb();
    const queue = new JobQueue(db);
    const id = await queue.enqueue("CLEANUP_EXPIRED_TOKENS", { test: true });
    expect(id).toBe("job-uuid-1");
    expect(db.insert).toHaveBeenCalled();
  });

  it("returns existing job id when uniqueKey already pending", async () => {
    const existingId = "existing-uuid";
    const db = makeDb({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: existingId }]),
          }),
        }),
      }),
    });

    const queue = new JobQueue(db);
    const id = await queue.enqueue(
      "CLEANUP_EXPIRED_TOKENS",
      {},
      { uniqueKey: "unique-test-key" },
    );

    expect(id).toBe(existingId);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("JobQueue.dequeueNextBatch", () => {
  it("executes UPDATE...RETURNING and maps rows", async () => {
    const fakeRow = {
      id: "job-1",
      name: "CLEANUP_EXPIRED_TOKENS",
      payload: null,
      status: "running",
      priority: 0,
      attempts: 1,
      max_attempts: 3,
      unique_key: null,
      run_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      error: null,
      created_at: new Date().toISOString(),
    };

    const db = makeDb({
      execute: vi.fn().mockResolvedValue({ rows: [fakeRow] }),
    });

    const queue = new JobQueue(db);
    const jobs = await queue.dequeueNextBatch(5);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("job-1");
    expect(jobs[0].attempts).toBe(1);
    expect(db.execute).toHaveBeenCalled();
  });

  it("returns empty array when no jobs are pending", async () => {
    const db = makeDb({ execute: vi.fn().mockResolvedValue({ rows: [] }) });
    const queue = new JobQueue(db);
    const jobs = await queue.dequeueNextBatch(5);
    expect(jobs).toHaveLength(0);
  });
});

describe("JobQueue.complete", () => {
  it("sets status to completed", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    });
    const db = makeDb({
      update: vi.fn().mockReturnValue({ set: setMock }),
    });

    const queue = new JobQueue(db);
    await queue.complete("job-1");

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
  });
});

describe("JobQueue.fail", () => {
  it("reschedules with exponential backoff if attempts < max_attempts", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    });
    const db = makeDb({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            // first select returns the job meta
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: setMock }),
    });

    // Patch select to return job with attempts=1, maxAttempts=3
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ attempts: 1, maxAttempts: 3 }]),
      }),
    });

    const queue = new JobQueue(db);
    await queue.fail("job-1", new Error("boom"));

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("moves to dead when attempts >= max_attempts", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    });
    const db = makeDb({
      update: vi.fn().mockReturnValue({ set: setMock }),
    });

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ attempts: 3, maxAttempts: 3 }]),
      }),
    });

    const queue = new JobQueue(db);
    await queue.fail("job-1", new Error("fatal"));

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dead" }),
    );
  });

  it("is a no-op if job id not found", async () => {
    const db = makeDb({
      update: vi.fn(),
    });

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const queue = new JobQueue(db);
    await queue.fail("nonexistent", "error");
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("JobQueue.runNow", () => {
  it("updates pending jobs to run_at = now, returns count", async () => {
    const db = makeDb({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ rowCount: 2 }),
        }),
      }),
    });

    const queue = new JobQueue(db);
    const count = await queue.runNow("CLEANUP_EXPIRED_TOKENS");
    expect(count).toBe(2);
  });
});
