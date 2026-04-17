import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../../env.js";
import type { JwtPayload } from "../../shared/types.js";

// Extend Hono context variables
declare module "hono" {
  interface ContextVariableMap {
    userId: string;
    userRole: string;
    jwtPayload: JwtPayload;
  }
}

export const authMiddleware = (
  verifyToken: (token: string) => Promise<JwtPayload>,
) =>
  createMiddleware<{ Bindings: CloudflareBindings }>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const token = authHeader.slice(7);
    if (!token) {
      return c.json({ error: "Missing token" }, 401);
    }

    try {
      const payload = await verifyToken(token);
      c.set("userId", payload.sub);
      c.set("userRole", payload.role);
      c.set("jwtPayload", payload);
      await next();
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  });
