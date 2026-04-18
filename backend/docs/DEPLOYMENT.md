# Deployment Guide

This document covers deploying the a11y DevTools API to Cloudflare Workers across development, staging, and production environments.

---

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed (`npm install -g wrangler`)
- Cloudflare account with Workers enabled
- Neon Postgres database provisioned
- Resend account for transactional email
- Auth provider credentials: Clerk (production) · Better Auth secret (staging/dev) · or Neon Auth JWKS URL + base URL (neon-auth)

---

## Step 1 — Authenticate Wrangler

```bash
wrangler login
```

---

## Step 2 — Configure environment variables

Non-secret vars are committed in `wrangler.toml` under each `[env.*]` block. Secrets must never be hardcoded — set them with:

```bash
# Production
wrangler secret put DATABASE_URL
wrangler secret put KEK_CURRENT
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put CLERK_SECRET_KEY
wrangler secret put CLERK_PUBLISHABLE_KEY

# Staging (add --env staging to each command)
wrangler secret put DATABASE_URL --env staging
wrangler secret put KEK_CURRENT  --env staging
# ... etc.
```

To generate a valid 32-byte KEK:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Step 3 — Create Rate Limit namespaces

The worker uses five Cloudflare Rate Limit bindings. Create them in the Cloudflare dashboard under __Workers & Pages → KV__ (Rate Limiting tab), then update the `namespace_id` values in `wrangler.toml`:

| Binding | Limit | Period |
|---------|-------|--------|
| `RATE_LIMITER_AUTH` | 5 req | 60 s |
| `RATE_LIMITER_API` | 60 req | 60 s |
| `RATE_LIMITER_PROXY` | 20 req | 60 s |
| `RATE_LIMITER_MODELS` | 10 req | 60 s |
| `RATE_LIMITER_MODELS_AGG` | 5 req | 60 s |

In development these bindings are optional — rate limiting passes through if the binding is absent.

---

## Step 4 — Run database migrations

Migrations use Drizzle Kit against the target database. Set `DATABASE_URL` in your local environment first:

```bash
export DATABASE_URL=postgresql://...
# Generate migration files from schema changes (if any)
npm run db:generate
# Apply migrations to database
npm run db:migrate
```

For production, run migrations from a CI step or a local terminal pointed at the production database before deploying.

---

## Step 5 — Deploy

```bash
# Production
npm run deploy
# equivalent to: wrangler deploy

# Staging
wrangler deploy --env staging

# Preview (ephemeral URL, does not affect production)
wrangler deploy --env dev
```

---

## Cron triggers

`wrangler.toml` registers a `* * * * *` cron trigger (every minute). The scheduled handler (`src/adapters/cron/scheduled.ts`) processes the `background_jobs` table, running:

- `CLEANUP_EXPIRED_TOKENS` — removes expired JWTs from `revoked_tokens`
- `CLEANUP_EXPIRED_MODEL_CACHE` — removes stale entries from `provider_models_cache`
- `CLEANUP_SOFT_DELETED` — hard-deletes users past their 30-day grace period
- `CLEANUP_USAGE_EVENTS` — purges `usage_events` older than 90 days
- `PROCESS_DELETION_REQUESTS` — executes pending deletion requests at grace period end
- `DETECT_INACTIVE_ACCOUNTS` — flags accounts with no activity in 90 days
- `REMINDER_KEY_ROTATION` — notifies admins when KEK rotation is due
- `REMINDER_INVALID_CREDENTIAL` — notifies users of broken provider connections

Cron jobs can also be triggered manually via `POST /api/v1/admin/jobs/run` (admin only).

---

## Rollback

Wrangler keeps prior deployments. Roll back via the Cloudflare dashboard (**Workers & Pages → your worker → Deployments**) or:

```bash
wrangler rollback
```

---

## Environment summary

| Environment | `AUTH_PROVIDER` | Rate limits |
|-------------|----------------|-------------|
| `dev` | `better-auth` | Relaxed (100/200/100) |
| `staging` | `clerk` | Production limits |
| `production` | `clerk` | Production limits |

`neon-auth` can be used in any environment. Set `AUTH_PROVIDER=neon-auth` and provide `NEON_AUTH_JWKS_URL` + `NEON_AUTH_BASE_URL`.
