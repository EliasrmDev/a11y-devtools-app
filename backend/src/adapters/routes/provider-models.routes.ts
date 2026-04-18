import { Hono } from "hono";
import type { CloudflareBindings } from "../../env.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import type { FetchProviderModelsUseCase } from "../../application/use-cases/providers/fetch-provider-models.use-case.js";
import type { FetchAllProviderModelsUseCase } from "../../application/use-cases/providers/fetch-all-provider-models.use-case.js";

export function createProviderModelsRoutes(deps: {
  fetchModels: FetchProviderModelsUseCase;
  fetchAllModels: FetchAllProviderModelsUseCase;
}) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  // GET /providers/connections/:id/models — models for a single connection
  app.get(
    "/connections/:id/models",
    rateLimitMiddleware("RATE_LIMITER_MODELS"),
    async (c) => {
      const connectionId = c.req.param("id");
      const models = await deps.fetchModels.execute(
        c.get("userId"),
        connectionId,
      );
      return c.json({ data: models }, 200);
    },
  );

  // GET /providers/models/live — aggregated models across all user connections
  app.get(
    "/models/live",
    rateLimitMiddleware("RATE_LIMITER_MODELS_AGG"),
    async (c) => {
      const results = await deps.fetchAllModels.execute(c.get("userId"));
      return c.json({ data: results }, 200);
    },
  );

  return app;
}
