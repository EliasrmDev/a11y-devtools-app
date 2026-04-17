import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { CloudflareBindings } from "../../env.js";
import { loginInputSchema, refreshInputSchema } from "../../application/dto/auth.dto.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import type { LoginUseCase } from "../../application/use-cases/auth/login.use-case.js";
import type { RefreshTokenUseCase } from "../../application/use-cases/auth/refresh-token.use-case.js";
import type { LogoutUseCase } from "../../application/use-cases/auth/logout.use-case.js";
import type { VerifyTokenUseCase } from "../../application/use-cases/auth/verify-token.use-case.js";

export function createAuthRoutes(deps: {
  login: LoginUseCase;
  refresh: RefreshTokenUseCase;
  logout: LogoutUseCase;
  verifyToken: VerifyTokenUseCase;
}) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  // POST /auth/login
  app.post(
    "/login",
    rateLimitMiddleware("RATE_LIMITER_AUTH"),
    zValidator("json", loginInputSchema),
    async (c) => {
      const input = c.req.valid("json");
      const result = await deps.login.execute(input.token, {
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
      });
      return c.json(result, 200);
    },
  );

  // POST /auth/refresh
  app.post(
    "/refresh",
    rateLimitMiddleware("RATE_LIMITER_AUTH"),
    zValidator("json", refreshInputSchema),
    async (c) => {
      const input = c.req.valid("json");
      const result = await deps.refresh.execute(input.refreshToken);
      return c.json(result, 200);
    },
  );

  // POST /auth/logout (requires valid JWT)
  app.post(
    "/logout",
    authMiddleware((token) => deps.verifyToken.execute(token)),
    async (c) => {
      const payload = c.get("jwtPayload");
      await deps.logout.execute(payload, {
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
      });
      return c.json({ ok: true }, 200);
    },
  );

  return app;
}
