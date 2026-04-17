import type { CloudflareBindings } from "./env.js";
import { createApp } from "./app.js";
import { handleScheduled } from "./adapters/cron/scheduled.js";

export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const app = createApp(env);
    return app.fetch(request, env, ctx);
  },

  async scheduled(
    event: ScheduledEvent,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  },
};
