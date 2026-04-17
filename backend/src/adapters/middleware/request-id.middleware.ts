import { createMiddleware } from "hono/factory";

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const requestId =
    c.req.header("X-Request-ID") ?? crypto.randomUUID();
  c.header("X-Request-ID", requestId);
  c.set("requestId" as never, requestId);
  await next();
});
