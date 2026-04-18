import type { CloudflareBindings } from "../../env.js";
import { parseEnv } from "../../env.js";
import { createDb } from "../../infrastructure/db/client.js";
import { createLogger } from "../../infrastructure/logging/logtail.js";
import { processScheduledJobs } from "../../infrastructure/jobs/processor.js";
import { ResendEmailAdapter } from "../../infrastructure/email/resend.adapter.js";
import { NotificationService } from "../../infrastructure/notifications/notification.service.js";

export async function handleScheduled(
  _event: ScheduledEvent,
  env: CloudflareBindings,
  _ctx: ExecutionContext,
): Promise<void> {
  const config = parseEnv(env as unknown as Record<string, unknown>);
  const db = createDb(config.DATABASE_URL);
  const logger = createLogger({ service: "cron" });
  const emailAdapter = new ResendEmailAdapter(config.RESEND_API_KEY);
  const notifications = new NotificationService(db, emailAdapter);

  try {
    await processScheduledJobs(db, notifications, logger, {
      neonAuthBaseUrl: config.NEON_AUTH_BASE_URL,
    });
  } catch (err) {
    logger.error("Scheduled job failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
