import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlockUserUseCase } from "../src/application/use-cases/admin/block-user.use-case.js";
import { ManageJobsUseCase } from "../src/application/use-cases/admin/manage-jobs.use-case.js";
import type { UserRepository } from "../src/domain/ports/user.repository.js";
import type { AuditRepository } from "../src/domain/ports/audit.repository.js";
import type { JobQueue } from "../src/infrastructure/jobs/job-queue.js";
import type { User } from "../src/domain/entities/user.entity.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

function mockActiveUser(): User {
  return {
    id: "user-1",
    email: "user@test.com",
    displayName: "Test User",
    avatarUrl: null,
    role: "user",
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

function mockUserRepo(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findById: vi.fn().mockResolvedValue(mockActiveUser()),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(mockActiveUser()),
    update: vi.fn().mockResolvedValue(mockActiveUser()),
    softDelete: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    hardDelete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    ...overrides,
  };
}

function mockAuditRepo(): AuditRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByUser: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    nullifyUser: vi.fn().mockResolvedValue(0),
  };
}

function mockJobQueue(): JobQueue {
  return {
    enqueue: vi.fn().mockResolvedValue("new-job-id"),
    dequeueNextBatch: vi.fn().mockResolvedValue([]),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    runNow: vi.fn().mockResolvedValue(1),
    scheduleIfNotExists: vi.fn().mockResolvedValue(undefined),
  } as unknown as JobQueue;
}

// ─── BlockUserUseCase ─────────────────────────────────────────────────────────

describe("BlockUserUseCase.block", () => {
  it("soft-deletes user and creates audit event", async () => {
    const users = mockUserRepo();
    const audit = mockAuditRepo();
    const uc = new BlockUserUseCase(users, audit);

    await uc.block({
      targetUserId: "user-1",
      adminUserId: "admin-1",
      reason: "Spam",
    });

    expect(users.softDelete).toHaveBeenCalledWith("user-1");
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.user.block" }),
    );
  });

  it("throws if user not found", async () => {
    const users = mockUserRepo({ findById: vi.fn().mockResolvedValue(null) });
    const uc = new BlockUserUseCase(users, mockAuditRepo());

    await expect(
      uc.block({ targetUserId: "uid", adminUserId: "admin", reason: "x" }),
    ).rejects.toThrow("User not found");
  });

  it("throws if user is already blocked", async () => {
    const blocked = { ...mockActiveUser(), deletedAt: new Date() };
    const users = mockUserRepo({ findById: vi.fn().mockResolvedValue(blocked) });
    const uc = new BlockUserUseCase(users, mockAuditRepo());

    await expect(
      uc.block({ targetUserId: "uid", adminUserId: "admin", reason: "x" }),
    ).rejects.toThrow("already blocked");
  });
});

describe("BlockUserUseCase.unblock", () => {
  it("restores user and creates audit event", async () => {
    const blocked = { ...mockActiveUser(), deletedAt: new Date() };
    const users = mockUserRepo({ findById: vi.fn().mockResolvedValue(blocked) });
    const audit = mockAuditRepo();
    const uc = new BlockUserUseCase(users, audit);

    await uc.unblock({ targetUserId: "user-1", adminUserId: "admin-1" });

    expect(users.restore).toHaveBeenCalledWith("user-1");
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.user.unblock" }),
    );
  });

  it("throws if user is not blocked", async () => {
    const uc = new BlockUserUseCase(mockUserRepo(), mockAuditRepo());

    await expect(
      uc.unblock({ targetUserId: "uid", adminUserId: "admin" }),
    ).rejects.toThrow("not blocked");
  });
});

// ─── ManageJobsUseCase ────────────────────────────────────────────────────────

describe("ManageJobsUseCase.listJobs", () => {
  it("delegates to jobQueue.list", async () => {
    const jobQueue = mockJobQueue();
    const uc = new ManageJobsUseCase(jobQueue, mockAuditRepo());

    await uc.listJobs({ status: "pending" });
    expect(jobQueue.list).toHaveBeenCalledWith({ status: "pending" });
  });
});

describe("ManageJobsUseCase.runJobNow", () => {
  it("triggers pending jobs and creates audit event", async () => {
    const jobQueue = mockJobQueue();
    const audit = mockAuditRepo();
    const uc = new ManageJobsUseCase(jobQueue, audit);

    await uc.runJobNow("CLEANUP_EXPIRED_TOKENS", "admin-1");

    expect(jobQueue.runNow).toHaveBeenCalledWith("CLEANUP_EXPIRED_TOKENS");
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.job.run",
        resourceId: "CLEANUP_EXPIRED_TOKENS",
      }),
    );
  });

  it("enqueues fresh job when no pending jobs existed", async () => {
    const jobQueue = mockJobQueue();
    (jobQueue.runNow as ReturnType<typeof vi.fn>).mockResolvedValue(0); // no pending
    const uc = new ManageJobsUseCase(jobQueue, mockAuditRepo());

    await uc.runJobNow("CLEANUP_EXPIRED_TOKENS", "admin-1");

    expect(jobQueue.enqueue).toHaveBeenCalledWith("CLEANUP_EXPIRED_TOKENS", {});
  });
});
