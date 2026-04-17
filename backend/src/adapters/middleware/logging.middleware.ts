import { createMiddleware } from "hono/factory";
import type { CloudflareBindings } from "../../env.js";

export const loggingMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
}>(async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  // Structured log line
  console.log(
    JSON.stringify({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      msg: `${method} ${path} ${status}`,
      method,
      path,
      status,
      duration,
      requestId: c.res.headers.get("X-Request-ID"),
    }),
  );
});
