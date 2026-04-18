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
- **Auth adapter** (`infrastructure/auth/auth.factory.ts`): pluggable via `AUTH_PROVIDER` env var — `clerk` (prod default), `better-auth` (dev default per `wrangler.toml`), or `neon-auth` (Neon Auth managed service; verifies JWTs via JWKS, users stored in `neon_auth` schema).
- **SSRF guard** (`infrastructure/ai-providers/ssrf-guard.ts`): all AI provider URLs validated before fetch — blocks private IPs, metadata endpoints, non-HTTPS, non-standard ports.
- **Rate limiting**: Cloudflare native `RateLimit` bindings (not in-process). Five limiters: `RATE_LIMITER_AUTH` (5/min), `RATE_LIMITER_API` (60/min), `RATE_LIMITER_PROXY` (20/min), `RATE_LIMITER_MODELS` (10/min, per-connection model fetch), `RATE_LIMITER_MODELS_AGG` (5/min, aggregated).
- **Cron**: Worker `scheduled` handler fires every minute, delegates to `infrastructure/jobs/processor.ts`. Eight job handlers: `cleanup-expired-tokens`, `cleanup-expired-model-cache`, `cleanup-soft-deleted`, `cleanup-usage-events`, `process-deletion`, `detect-inactive-accounts`, `reminder-key-rotation`, `reminder-invalid-credential`. Jobs use `uniqueKey` for idempotent scheduling.
- **Job queue** (`infrastructure/jobs/job-queue.ts`): `JobQueue` wraps the `background_jobs` DB table with atomic dequeue via raw SQL; `ManageJobsUseCase` exposes admin control over it.
- **Soft deletes**: users soft-deleted via `deletedAt` timestamp — `process-deletion` job hard-deletes after 30-day grace period.
- **Provider model registry** (`infrastructure/ai-providers/models/registry.ts`): static map of `ProviderType → ProviderModelsClient`. Supported: openai, anthropic, groq, openrouter, gemini. Two-tier cache: in-memory (5-min TTL via `memory-cache.ts`) + DB (`provider_models_cache` table, 1-hour TTL).
- **AI clients** (`infrastructure/ai-providers/`): openai-compatible, anthropic, gemini, groq, cloudflare-ai. `client.factory.ts` routes `providerType` to correct implementation.
- **Accessibility suggest** (`application/use-cases/accessibility/suggest-accessibility.use-case.ts`): takes an axe-core violation (selector + HTML snippet + failure summary) and returns structured AI remediation advice. Governed by `ACCESSIBILITY` constants — 30 s timeout, 2 retries, deterministic temperature 0, max 1 024 tokens.

### Route structure

Public: `GET /health`, `GET /health/ready`, `POST /auth/login`, `POST /auth/refresh`  
Protected (JWT via `authMiddleware`): mounted under `/api/v1/`
- `/api/v1/providers/connections` — CRUD + `POST /:id/test`; `GET /:id/models` (live from provider, 10/min); `GET /models/live` (aggregated across all connections, 5/min); `GET /models` (admin-managed model registry)
- `/api/v1/proxy/chat/completions` — OpenAI-compatible proxy, SSE streaming supported
- `/api/v1/accessibility/suggest` — WCAG remediation for axe-core violation
- `/api/v1/users/me` — profile CRUD, data export, deletion request/cancel (30-day grace)
- `/api/v1/admin` — users (list/block/unblock/force-delete), models (create/toggle/delete), audit log, stats, jobs (list/run)
- `/api/v1/metrics` — JSON or Prometheus format system metrics (admin only)

### Environment variables

Required secrets (set via `wrangler secret put` or `.dev.vars`):
`DATABASE_URL`, `KEK_CURRENT`, `JWT_SECRET`, `RESEND_API_KEY`  
Auth-provider-specific: `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` (clerk) · `BETTER_AUTH_SECRET` (better-auth) · `NEON_AUTH_JWKS_URL` + `NEON_AUTH_BASE_URL` (neon-auth)  
Optional: `LOGTAIL_SOURCE_TOKEN`, `ALLOWED_ORIGINS`, `ALLOWED_ORIGINS_DEV`, `KEK_VERSION`, `ENVIRONMENT`

For local dev create `.dev.vars` in the backend directory — Wrangler loads it automatically.
