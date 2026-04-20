import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { CloudflareBindings } from "../../env.js";
import {
  createConnectionInputSchema,
  updateConnectionInputSchema,
} from "../../application/dto/provider.dto.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import type { CreateConnectionUseCase } from "../../application/use-cases/providers/create-connection.use-case.js";
import type { ListConnectionsUseCase } from "../../application/use-cases/providers/list-connections.use-case.js";
import type { UpdateConnectionUseCase } from "../../application/use-cases/providers/update-connection.use-case.js";
import type { DeleteConnectionUseCase } from "../../application/use-cases/providers/delete-connection.use-case.js";
import type { TestConnectionUseCase } from "../../application/use-cases/providers/test-connection.use-case.js";
import type { ListModelsUseCase } from "../../application/use-cases/providers/list-models.use-case.js";

export function createProviderRoutes(deps: {
  create: CreateConnectionUseCase;
  list: ListConnectionsUseCase;
  update: UpdateConnectionUseCase;
  remove: DeleteConnectionUseCase;
  testConnection: TestConnectionUseCase;
  listModels: ListModelsUseCase;
}) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  // All provider routes use API rate limiter
  app.use("*", rateLimitMiddleware("RATE_LIMITER_API"));

  // GET /providers/connections
  app.get("/connections", async (c) => {
    const connections = await deps.list.execute(c.get("userId"));
    return c.json({ data: connections }, 200);
  });

  // POST /providers/connections
  app.post(
    "/connections",
    zValidator("json", createConnectionInputSchema),
    async (c) => {
      const input = c.req.valid("json");
      const result = await deps.create.execute(c.get("userId"), input, {
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
      });
      return c.json(result, 201);
    },
  );

  // PATCH /providers/connections/:id
  app.patch(
    "/connections/:id",
    zValidator("json", updateConnectionInputSchema),
    async (c) => {
      const id = c.req.param("id");
      const input = c.req.valid("json");
      const result = await deps.update.execute(
        c.get("userId"),
        id,
        input,
        {
          ipAddress: c.req.header("CF-Connecting-IP"),
          userAgent: c.req.header("User-Agent"),
        },
      );
      return c.json(result, 200);
    },
  );

  // DELETE /providers/connections/:id
  app.delete("/connections/:id", async (c) => {
    const id = c.req.param("id");
    await deps.remove.execute(c.get("userId"), id, {
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
    });
    return c.json({ ok: true }, 200);
  });

  // POST /providers/connections/:id/test
  app.post("/connections/:id/test", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ modelId?: string }>().catch(() => ({} as { modelId?: string }));
    const result = await deps.testConnection.execute(
      c.get("userId"),
      id,
      {
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
        modelId: body.modelId,
      },
    );
    return c.json(result, 200);
  });

  // GET /providers/models
  app.get("/models", async (c) => {
    const providerType = c.req.query("providerType");
    const enabledOnly = c.req.query("enabledOnly") !== "false";
    const models = await deps.listModels.execute({
      providerType,
      enabledOnly,
    });
    return c.json({ data: models }, 200);
  });

  return app;
}
