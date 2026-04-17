import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../../env.js";
import { RATE_LIMITS } from "../../shared/constants.js";

type RateLimiterName = "RATE_LIMITER_AUTH" | "RATE_LIMITER_API" | "RATE_LIMITER_PROXY";

export const rateLimitMiddleware = (limiterName: RateLimiterName) =>
  createMiddleware<{ Bindings: CloudflareBindings }>(async (c, next) => {
    const limiter = c.env[limiterName];
    if (!limiter) {
      // If binding not available (e.g., local dev), skip
      await next();
      return;
    }

    // Use IP + userId as rate limit key
    const ip =
      c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      "unknown";
    const userId = c.get("userId") ?? "anonymous";
    const key = `${ip}:${userId}`;

    const { success } = await limiter.limit({ key });
    if (!success) {
      const limits: Record<RateLimiterName, number> = {
        RATE_LIMITER_AUTH: RATE_LIMITS.AUTH.limit,
        RATE_LIMITER_API: RATE_LIMITS.API.limit,
        RATE_LIMITER_PROXY: RATE_LIMITS.PROXY.limit,
      };

      return c.json(
        {
          error: "Too many requests",
          retryAfter: 60,
        },
        429,
        {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(limits[limiterName]),
        },
      );
    }

    await next();
  });
