import { Hono } from "hono";
import type { CloudflareBindings } from "../../env.js";

export function createHealthRoutes() {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  app.get("/", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  app.get("/ready", async (c) => {
    // Could add DB connection check here later
    return c.json({ status: "ready" });
  });

  return app;
}
