import { Hono } from "hono";
import type { CloudflareBindings } from "../../env.js";
import { adminMiddleware } from "../middleware/admin.middleware.js";
import type { GetAdminStatsUseCase } from "../../application/use-cases/admin/get-admin-stats.use-case.js";

interface MetricsRouteDeps {
  getStats: GetAdminStatsUseCase;
}

/**
 * Internal metrics endpoint — admin-only.
 *
 * GET /api/v1/metrics          Returns JSON gauges/counters.
 * GET /api/v1/metrics?format=prometheus  Returns Prometheus text format.
 *
 * Designed to be scraped by Better Stack / Grafana via a Cloudflare
 * scheduled fetch or an external Prometheus remote_write integration.
 */
export function createMetricsRoutes(deps: MetricsRouteDeps) {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  app.use("*", adminMiddleware);

  app.get("/", async (c) => {
    const format = c.req.query("format");
    const stats = await deps.getStats.execute();

    if (format === "prometheus") {
      const lines = [
        "# HELP a11y_users_total Total registered users",
        "# TYPE a11y_users_total gauge",
        `a11y_users_total ${stats.users.total}`,
        "# HELP a11y_users_active Active (non-deleted) users",
        "# TYPE a11y_users_active gauge",
        `a11y_users_active ${stats.users.active}`,
        "# HELP a11y_users_blocked Blocked/deleted users",
        "# TYPE a11y_users_blocked gauge",
        `a11y_users_blocked ${stats.users.blocked}`,
        "# HELP a11y_connections_total Total AI provider connections",
        "# TYPE a11y_connections_total gauge",
        `a11y_connections_total ${stats.connections.total}`,
        "# HELP a11y_connections_active Active AI provider connections",
        "# TYPE a11y_connections_active gauge",
        `a11y_connections_active ${stats.connections.active}`,
        "# HELP a11y_usage_requests_30d AI proxy requests in the last 30 days",
        "# TYPE a11y_usage_requests_30d counter",
        `a11y_usage_requests_30d ${stats.usage.requestsLast30d}`,
        "# HELP a11y_usage_tokens_30d Total tokens consumed in the last 30 days",
        "# TYPE a11y_usage_tokens_30d counter",
        `a11y_usage_tokens_30d ${stats.usage.tokensLast30d}`,
        "# HELP a11y_jobs_pending Pending background jobs",
        "# TYPE a11y_jobs_pending gauge",
        `a11y_jobs_pending ${stats.jobs.pending}`,
        "# HELP a11y_jobs_running Currently-running background jobs",
        "# TYPE a11y_jobs_running gauge",
        `a11y_jobs_running ${stats.jobs.running}`,
        "# HELP a11y_jobs_failed Failed background jobs",
        "# TYPE a11y_jobs_failed gauge",
        `a11y_jobs_failed ${stats.jobs.failed}`,
        "# HELP a11y_jobs_dead Dead (unrecoverable) background jobs",
        "# TYPE a11y_jobs_dead gauge",
        `a11y_jobs_dead ${stats.jobs.dead}`,
        "",
      ].join("\n");

      return new Response(lines, {
        headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    }

    return c.json(
      {
        timestamp: new Date().toISOString(),
        ...stats,
      },
      200,
    );
  });

  return app;
}
