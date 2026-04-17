import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../../env.js";

/** Seconds within which a re-login must have occurred to access admin endpoints. */
const RECENT_AUTH_WINDOW_SECONDS = 15 * 60; // 15 minutes

export const adminMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
}>(async (c, next) => {
  const role = c.get("userRole");
  if (role !== "admin") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  // Require a recent authentication (iat within last 15 minutes)
  const payload = c.get("jwtPayload");
  if (!payload?.iat) {
    return c.json({ error: "Unauthorized: missing token claims" }, 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - payload.iat > RECENT_AUTH_WINDOW_SECONDS) {
    return c.json(
      { error: "Unauthorized: recent authentication required for admin access" },
      401,
    );
  }

  await next();
});

