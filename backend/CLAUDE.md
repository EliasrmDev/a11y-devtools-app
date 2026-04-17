# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # local dev via wrangler
npm run deploy       # deploy to Cloudflare Workers
npm run check        # typecheck + lint + tests (run before committing)
npm run test         # vitest run (single pass)
npm run test:watch   # vitest in watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/

# DB (requires DATABASE_URL in env)
npm run db:generate  # generate Drizzle migrations
npm run db:migrate   # apply migrations
npm run db:push      # push schema without migration files (dev only)
npm run db:studio    # Drizzle Studio GUI
```

Tests live in `tests/` (not `src/`). Run a single test file: `npx vitest run tests/path/to/file.test.ts`.

## Architecture

Cloudflare Worker running **Hono** with a clean architecture layout:

```
src/
  domain/          # entities, value objects, ports (interfaces), errors — no deps
  application/     # use cases + DTOs — depends only on domain
  infrastructure/  # DB (Drizzle + Neon), crypto, auth, email, AI clients — implements ports
  adapters/        # Hono routes + middleware — wires HTTP to use cases
  app.ts           # composition root — instantiates everything, wires DI manually
  index.ts         # CF Worker entry (fetch + scheduled handlers)
```

**Dependency flow:** `adapters → application → domain ← infrastructure`

All infrastructure implements domain ports. Use cases depend on ports, never concrete classes.

### Key patterns

- **Result type** (`src/shared/result.ts`): use cases return `Result<T, E>` — check `result.ok` before accessing `.value` or `.error`. Never throw from use cases.
- **Envelope encryption** (`infrastructure/crypto/envelope-encryption.ts`): AES-256-GCM, two-layer (KEK wraps per-record DEK). Provider API keys are always stored encrypted. `KEK_CURRENT` must be 32 bytes base64-encoded.
- **Auth adapter** (`infrastructure/auth/auth.factory.ts`): pluggable via `AUTH_PROVIDER` env var — `clerk` (prod default) or `better-auth` (dev default per `wrangler.toml`).
- **SSRF guard** (`infrastructure/ai-providers/ssrf-guard.ts`): all AI provider URLs validated before fetch — blocks private IPs, metadata endpoints, non-HTTPS, non-standard ports.
- **Rate limiting**: Cloudflare native `RateLimit` bindings (not in-process). Three limiters: `RATE_LIMITER_AUTH` (5/min), `RATE_LIMITER_API` (60/min), `RATE_LIMITER_PROXY` (20/min).
- **Cron**: Worker `scheduled` handler fires every minute, delegates to `infrastructure/jobs/processor.ts` for cleanup jobs (expired tokens, usage events, deletion requests).
- **Job queue** (`infrastructure/jobs/job-queue.ts`): `JobQueue` wraps the `background_jobs` DB table; `ManageJobsUseCase` exposes admin control over it.
- **Accessibility suggest** (`application/use-cases/accessibility/suggest-accessibility.use-case.ts`): takes an axe-core violation (selector + HTML snippet + failure summary) and returns structured AI remediation advice. Governed by `ACCESSIBILITY` constants — 30 s timeout, 2 retries, deterministic temperature 0, max 1 024 tokens.

### Route structure

Public: `GET /health`, `POST /auth/*`  
Protected (JWT via `authMiddleware`): mounted under `/api/v1/`
- `/api/v1/providers` — CRUD + test connection + list available models
- `/api/v1/proxy` — AI request proxy (streaming supported)
- `/api/v1/accessibility` — `POST /suggest` returns AI remediation for an axe-core violation
- `/api/v1/users` — profile, data export, deletion request/cancel
- `/api/v1/admin` — user list, block user, model management, audit log, stats, job management
- `/api/v1/metrics` — Prometheus/JSON system metrics (admin only)

### Environment variables

Required secrets (set via `wrangler secret put` or `.dev.vars`):
`DATABASE_URL`, `KEK_CURRENT`, `JWT_SECRET`, `RESEND_API_KEY`  
Auth-provider-specific: `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` (clerk) or `BETTER_AUTH_SECRET` (better-auth)  
Optional: `LOGTAIL_SOURCE_TOKEN`, `ALLOWED_ORIGINS`, `KEK_VERSION`

For local dev create `.dev.vars` in the backend directory — Wrangler loads it automatically.
