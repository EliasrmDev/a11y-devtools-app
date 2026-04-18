import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { CloudflareBindings } from "../../env.js";
import {
  listUsersQuerySchema,
  auditLogQuerySchema,
  manageModelInputSchema,
  blockUserSchema,
  listJobsQuerySchema,
  runJobSchema,
  listDeletionRequestsQuerySchema,
} from "../../application/dto/admin.dto.js";
import { adminMiddleware } from "../middleware/admin.middleware.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import type { ListUsersUseCase } from "../../application/use-cases/admin/list-users.use-case.js";
import type { ManageModelsUseCase } from "../../application/use-cases/admin/manage-models.use-case.js";
import type { ViewAuditLogUseCase } from "../../application/use-cases/admin/view-audit-log.use-case.js";
import type { BlockUserUseCase } from "../../application/use-cases/admin/block-user.use-case.js";
import type { GetAdminStatsUseCase } from "../../application/use-cases/admin/get-admin-stats.use-case.js";
import type { ManageJobsUseCase } from "../../application/use-cases/admin/manage-jobs.use-case.js";
import type { UserRepository } from "../../domain/ports/user.repository.js";
import type { DeletionRequestCreator } from "../../application/use-cases/users/request-deletion.use-case.js";
import type { AuditRepository } from "../../domain/ports/audit.repository.js";

export function createAdminRoutes(deps: {
  listUsers: ListUsersUseCase;
  manageModels: ManageModelsUseCase;
  viewAuditLog: ViewAuditLogUseCase;
  blockUser: BlockUserUseCase;
  getStats: GetAdminStatsUseCase;
  manageJobs: ManageJobsUseCase;
  userRepo: UserRepository;
  deletionRequestRepo: DeletionRequestCreator;
  auditRepo: AuditRepository;
}) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  app.use("*", adminMiddleware);
  app.use("*", rateLimitMiddleware("RATE_LIMITER_API"));

  // ─── User management ───────────────────────────────────────────────────────

  // GET /admin/users
  app.get(
    "/users",
    zValidator("query", listUsersQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const result = await deps.listUsers.execute({
        page: query.page,
        limit: query.limit,
        role: query.role,
      });
      return c.json(result, 200);
    },
  );

  // GET /admin/users/:id
  app.get("/users/:id", async (c) => {
    const user = await deps.userRepo.findById(c.req.param("id"));
    if (!user) return c.json({ error: "User not found" }, 404);
    // Never expose secrets — only safe profile fields
    return c.json(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        deletedAt: user.deletedAt,
      },
      200,
    );
  });

  // POST /admin/users/:id/block
  app.post(
    "/users/:id/block",
    zValidator("json", blockUserSchema),
    async (c) => {
      const { reason } = c.req.valid("json");
      await deps.blockUser.block({
        targetUserId: c.req.param("id"),
        adminUserId: c.get("userId"),
        reason,
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
      });
      return c.json({ ok: true }, 200);
    },
  );

  // POST /admin/users/:id/unblock
  app.post("/users/:id/unblock", async (c) => {
    await deps.blockUser.unblock({
      targetUserId: c.req.param("id"),
      adminUserId: c.get("userId"),
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });
    return c.json({ ok: true }, 200);
  });

  /**
   * DELETE /admin/users/:id
   * Creates an immediate (0-day grace period) deletion request.
   */
  app.delete("/users/:id", async (c) => {
    const targetId = c.req.param("id");
    const user = await deps.userRepo.findById(targetId);
    if (!user) return c.json({ error: "User not found" }, 404);

    await deps.deletionRequestRepo.create(targetId, new Date());

    await deps.auditRepo.create({
      userId: c.get("userId"),
      action: "admin.user.force_delete",
      resourceType: "user",
      resourceId: targetId,
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });

    return c.json({ ok: true }, 200);
  });

  // ─── Models ────────────────────────────────────────────────────────────────

  // GET /admin/models
  app.get("/models", async (c) => {
    const models = await deps.manageModels.listGlobalModels();
    return c.json({ data: models }, 200);
  });

  // POST /admin/models
  app.post(
    "/models",
    zValidator("json", manageModelInputSchema),
    async (c) => {
      const input = c.req.valid("json");
      const result = await deps.manageModels.createModel(
        {
          providerType: input.providerType,
          modelId: input.modelId,
          displayName: input.displayName,
          isEnabled: input.isAvailable,
        },
        c.get("userId"),
        {
          ipAddress: c.req.header("CF-Connecting-IP"),
          userAgent: c.req.header("User-Agent"),
        },
      );
      return c.json(result, 201);
    },
  );

  // PATCH /admin/models/:id
  app.patch("/models/:id", async (c) => {
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    await deps.manageModels.toggleModel(
      c.req.param("id"),
      enabled,
      c.get("userId"),
      {
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
      },
    );
    return c.json({ ok: true }, 200);
  });

  // DELETE /admin/models/:id
  app.delete("/models/:id", async (c) => {
    await deps.manageModels.deleteModel(c.req.param("id"), c.get("userId"), {
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });
    return c.json({ ok: true }, 200);
  });

  // ─── Audit ─────────────────────────────────────────────────────────────────

  // GET /admin/audit
  app.get(
    "/audit",
    zValidator("query", auditLogQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const result = await deps.viewAuditLog.execute({
        page: query.page,
        limit: query.limit,
        action: query.action,
        resourceType: query.resourceType,
        since: query.since,
        until: query.until,
      });
      return c.json(result, 200);
    },
  );

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  // GET /admin/jobs
  app.get(
    "/jobs",
    zValidator("query", listJobsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const result = await deps.manageJobs.listJobs({
        name: query.name,
        status: query.status,
      });
      return c.json(result, 200);
    },
  );

  // POST /admin/jobs/run
  app.post(
    "/jobs/run",
    zValidator("json", runJobSchema),
    async (c) => {
      const { name } = c.req.valid("json");
      await deps.manageJobs.runJobNow(name, c.get("userId"), {
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
      });
      return c.json({ ok: true, job: name }, 200);
    },
  );

  // ─── Deletion requests ─────────────────────────────────────────────────────

  // GET /admin/deletion-requests
  app.get(
    "/deletion-requests",
    zValidator("query", listDeletionRequestsQuerySchema),
    async (c) => {
      const { page, limit, status } = c.req.valid("query");
      const result = await deps.deletionRequestRepo.listAll({ page, limit, status });

      // Enrich with user email
      const enriched = await Promise.all(
        result.data.map(async (dr) => {
          const user = await deps.userRepo.findById(dr.userId);
          return {
            ...dr,
            userEmail: user?.email ?? null,
            userDisplayName: user?.displayName ?? null,
          };
        }),
      );

      return c.json({ data: enriched, total: result.total, page, limit }, 200);
    },
  );

  // POST /admin/deletion-requests/:id/execute
  // Immediately reschedules and executes the deletion by setting scheduledFor = now.
  app.post("/deletion-requests/:id/execute", async (c) => {
    const id = c.req.param("id");
    const request = await deps.deletionRequestRepo.findById(id);
    if (!request) return c.json({ error: "Deletion request not found" }, 404);

    if (request.status === "completed") {
      return c.json({ error: "Deletion already completed" }, 409);
    }

    // Mark as pending and set scheduledFor = now so the next job tick picks it up
    await deps.deletionRequestRepo.forceScheduleNow(id);

    await deps.auditRepo.create({
      userId: c.get("userId"),
      action: "admin.deletion_request.force_execute",
      resourceType: "user",
      resourceId: request.userId,
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      metadata: { deletionRequestId: id },
    });

    return c.json({ ok: true, message: "Deletion scheduled for immediate execution" }, 200);
  });

  // DELETE /admin/deletion-requests/:id/cancel
  app.delete("/deletion-requests/:id/cancel", async (c) => {
    const id = c.req.param("id");
    const request = await deps.deletionRequestRepo.findById(id);
    if (!request) return c.json({ error: "Deletion request not found" }, 404);

    if (request.status === "completed") {
      return c.json({ error: "Cannot cancel a completed deletion" }, 409);
    }

    await deps.deletionRequestRepo.cancel(id);
    // Restore user soft-delete if still present (best-effort)
    await deps.userRepo.restore(request.userId).catch(() => {});

    await deps.auditRepo.create({
      userId: c.get("userId"),
      action: "admin.deletion_request.cancelled",
      resourceType: "user",
      resourceId: request.userId,
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      metadata: { deletionRequestId: id },
    });

    return c.json({ ok: true }, 200);
  });

  // ─── Stats ─────────────────────────────────────────────────────────────────

  // GET /admin/stats
  app.get("/stats", async (c) => {
    const stats = await deps.getStats.execute();
    return c.json(stats, 200);
  });

  return app;
}

