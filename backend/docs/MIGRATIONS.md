# Database Migrations

Schema is managed with [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) against a Neon Postgres database.

---

## Schema location

All table definitions live in `src/infrastructure/db/schema/`. The barrel file `schema/index.ts` re-exports every table and is the entry point for both Drizzle Kit and the ORM client.

Current tables:

| Table | File | Purpose |
|-------|------|---------|
| `users` | `users.ts` | Core user accounts |
| `identities` | `identities.ts` | OAuth / external identity links |
| `sessions` | `sessions.ts` | Active sessions |
| `revoked_tokens` | `revoked-tokens.ts` | JTI blocklist for logged-out tokens |
| `ai_provider_connections` | `ai-provider-connections.ts` | User-registered AI provider configs |
| `encrypted_secrets` | `encrypted-secrets.ts` | Envelope-encrypted API keys (one per connection) |
| `provider_models` | `provider-models.ts` | Admin-managed list of available models |
| `audit_events` | `audit-events.ts` | Immutable audit log (365-day retention) |
| `usage_events` | `usage-events.ts` | Per-request token/latency tracking (90-day retention) |
| `deletion_requests` | `deletion-requests.ts` | GDPR account deletion queue |
| `notification_preferences` | `notification-preferences.ts` | Per-user notification settings |
| `reminder_jobs` | `reminder-jobs.ts` | Scheduled reminder state |
| `background_jobs` | `background-jobs.ts` | Job queue (pending/running/completed/dead) |

---

## Workflow

### 1. Edit schema

Modify or add a file in `src/infrastructure/db/schema/`. Export new tables from `schema/index.ts`.

### 2. Generate migration

```bash
export DATABASE_URL=postgresql://...
npm run db:generate
```

Drizzle Kit diffs the current schema against the last migration snapshot and writes a new SQL file to `src/infrastructure/db/migrations/`.

### 3. Review the generated SQL

Always inspect the migration file before applying — Drizzle Kit may generate destructive statements (e.g. `DROP COLUMN`) if a column was renamed rather than added+removed.

### 4. Apply migration

```bash
npm run db:migrate
```

Applies all pending migrations in order. Safe to run repeatedly — already-applied migrations are tracked in the `drizzle.__drizzle_migrations` table.

---

## Development shortcut

```bash
npm run db:push
```

Pushes the current schema directly to the database without creating migration files. Use only in local dev — never against staging or production.

---

## Drizzle Studio

```bash
npm run db:studio
```

Opens a browser GUI at `https://local.drizzle.studio` for inspecting and editing data.

---

## Production migrations

Run migrations before deploying a new Worker version that depends on schema changes:

```bash
DATABASE_URL=<prod-url> npm run db:migrate
wrangler deploy
```

Migrations are forward-only. If a migration must be reverted, write a new corrective migration — do not edit or delete existing migration files.

---

## Adding a new table — checklist

1. Create `src/infrastructure/db/schema/<table-name>.ts`
2. Export from `schema/index.ts`
3. Run `npm run db:generate` and review the SQL
4. Create a repository implementation in `src/infrastructure/db/repositories/`
5. Define the port interface in `src/domain/ports/`
6. Wire the repository in `src/app.ts`
