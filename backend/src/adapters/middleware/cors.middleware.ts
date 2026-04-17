import { cors } from "hono/cors";

export const corsMiddleware = (allowedOrigins: string[]) =>
  cors({
    origin: (origin) => {
      // Allow Chrome extension origins
      if (origin.startsWith("chrome-extension://")) {
        return origin;
      }
      // Allow configured origins
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID", "X-RateLimit-Limit", "Retry-After"],
    maxAge: 86400,
    credentials: true,
  });
