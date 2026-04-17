import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import type { CloudflareBindings } from "../../env.js";
import { aiProxyInputSchema } from "../../application/dto/proxy.dto.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import type { AiProxyUseCase } from "../../application/use-cases/proxy/ai-proxy.use-case.js";

export function createProxyRoutes(deps: { aiProxy: AiProxyUseCase }) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  app.use("*", rateLimitMiddleware("RATE_LIMITER_PROXY"));

  // POST /proxy/chat/completions
  app.post(
    "/chat/completions",
    zValidator("json", aiProxyInputSchema),
    async (c) => {
      const input = c.req.valid("json");
      const userId = c.get("userId");

      const result = await deps.aiProxy.execute(userId, input);

      // Streaming response
      if (result instanceof ReadableStream) {
        return streamSSE(c, async (stream) => {
          const reader = (result as ReadableStream<Uint8Array>).getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const text =
                typeof value === "string"
                  ? value
                  : new TextDecoder().decode(value);

              await stream.writeSSE({ data: text });
            }
            await stream.writeSSE({ data: "[DONE]" });
          } finally {
            reader.releaseLock();
          }
        });
      }

      // Non-streaming response
      return c.json(result, 200);
    },
  );

  return app;
}
