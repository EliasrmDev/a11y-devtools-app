import { createMiddleware } from "hono/factory";
import { DomainError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, ValidationError, RateLimitError } from "../../domain/errors/index.js";

export const errorMiddleware = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof DomainError) {
      const statusMap: Record<string, number> = {
        [NotFoundError.name]: 404,
        [UnauthorizedError.name]: 401,
        [ForbiddenError.name]: 403,
        [ConflictError.name]: 409,
        [ValidationError.name]: 422,
        [RateLimitError.name]: 429,
      };

      const status = statusMap[err.constructor.name] ?? 400;
      return c.json({ error: err.message, code: err.code }, status as any);
    }

    console.error(
      JSON.stringify({
        level: "error",
        msg: "Unhandled error",
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );

    return c.json({ error: "Internal server error" }, 500);
  }
});
