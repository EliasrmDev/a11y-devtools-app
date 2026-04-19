import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { CloudflareBindings } from "../../env.js";
import { updateProfileInputSchema } from "../../application/dto/user.dto.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import type { GetProfileUseCase } from "../../application/use-cases/users/get-profile.use-case.js";
import type { UpdateProfileUseCase } from "../../application/use-cases/users/update-profile.use-case.js";
import type { RequestDeletionUseCase, CancelDeletionUseCase, DeletionRequestCreator } from "../../application/use-cases/users/request-deletion.use-case.js";
import type { ExportDataUseCase } from "../../application/use-cases/users/export-data.use-case.js";

export function createUserRoutes(deps: {
  getProfile: GetProfileUseCase;
  updateProfile: UpdateProfileUseCase;
  requestDeletion: RequestDeletionUseCase;
  cancelDeletion: CancelDeletionUseCase;
  exportData: ExportDataUseCase;
  deletionRepo: DeletionRequestCreator;
}) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  app.use("*", rateLimitMiddleware("RATE_LIMITER_API"));

  // GET /users/me
  app.get("/me", async (c) => {
    const profile = await deps.getProfile.execute(c.get("userId"));
    return c.json(profile, 200);
  });

  // PATCH /users/me
  app.patch(
    "/me",
    zValidator("json", updateProfileInputSchema),
    async (c) => {
      const input = c.req.valid("json");
      const profile = await deps.updateProfile.execute(
        c.get("userId"),
        input,
        {
          ipAddress: c.req.header("CF-Connecting-IP"),
          userAgent: c.req.header("User-Agent"),
        },
      );
      return c.json(profile, 200);
    },
  );

  // POST /users/me/deletion
  app.post("/me/deletion", async (c) => {
    const result = await deps.requestDeletion.execute(c.get("userId"), {
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });
    return c.json(result, 202);
  });

  // GET /users/me/deletion
  app.get("/me/deletion", async (c) => {
    const active = await deps.deletionRepo.findActiveByUser(c.get("userId"));
    if (!active) return c.json({ deletion: null }, 200);
    return c.json(
      {
        deletion: {
          id: active.id,
          status: active.status,
          scheduledFor: active.scheduledFor.toISOString(),
          requestedAt: active.requestedAt.toISOString(),
        },
      },
      200,
    );
  });

  // DELETE /users/me/deletion
  app.delete("/me/deletion", async (c) => {
    await deps.cancelDeletion.execute(c.get("userId"), {
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });
    return c.json({ ok: true }, 200);
  });

  // GET /users/me/export
  app.get("/me/export", async (c) => {
    const data = await deps.exportData.execute(c.get("userId"), {
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });
    return c.json(data, 200);
  });

  return app;
}
