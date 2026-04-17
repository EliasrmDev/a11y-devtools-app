# a11y DevTools — Backend API

REST API backend for [a11y DevTools](https://github.com/EliasrmDev/a11y-devtools-ext), a Chrome extension for WCAG 2.1/2.2 accessibility testing. The API acts as a secure AI proxy, letting the extension call AI providers (OpenAI, Anthropic, OpenRouter) without exposing user API keys in the browser.

Built on **Hono** and deployed as a **Cloudflare Worker**. Database is **Neon Postgres** via Drizzle ORM.

---

## Features

- **AI proxy** — forwards requests to OpenAI-compatible and Anthropic endpoints; supports streaming
- **Provider connections** — users register their own API keys; keys are stored encrypted at rest
- **Envelope encryption** — AES-256-GCM, two-layer (KEK wraps per-record DEK)
- **Pluggable auth** — Clerk (production) or Better Auth (development)
- **Rate limiting** — Cloudflare-native: 5 req/min auth, 60 req/min API, 20 req/min proxy
- **Audit log** — all sensitive mutations recorded; 365-day retention
- **Usage tracking** — token counts, latency, error codes; 90-day retention
- **GDPR flows** — data export and account deletion (30-day grace period)
- **Accessibility suggest** — axe-core violation in → structured AI remediation advice out (retry, timeout, structured JSON validation)
- **Scheduled jobs** — DB-backed job queue; cron every minute processes token cleanup, deletion requests, inactivity detection, and key-rotation reminders

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers |
| Framework | Hono 4 |
| Database | Neon Postgres + Drizzle ORM |
| Auth | Clerk / Better Auth (swappable) |
| Crypto | Node.js `crypto` (AES-256-GCM) |
| Email | Resend |
| Logging | Logtail |
| Validation | Zod |
| Testing | Vitest |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) Postgres database
- A [Cloudflare](https://cloudflare.com) account with Workers enabled
- A [Resend](https://resend.com) API key (email)
- Clerk or Better Auth credentials

### Local development

1. Install dependencies:

```bash
npm install
```

2. Create `.dev.vars` in the project root (loaded automatically by Wrangler):

```ini
DATABASE_URL=postgresql://...
KEK_CURRENT=<base64-encoded 32-byte key>
KEK_VERSION=1
JWT_SECRET=<at least 32 random characters>
RESEND_API_KEY=re_...
AUTH_PROVIDER=better-auth
BETTER_AUTH_SECRET=<random secret>
ALLOWED_ORIGINS=http://localhost:3000
ENVIRONMENT=development
```

To generate a valid KEK:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

3. Run migrations:

```bash
npm run db:migrate
```

4. Start the dev server:

```bash
npm run dev
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `KEK_CURRENT` | Yes | 32-byte key-encryption key, base64-encoded |
| `KEK_VERSION` | No | Integer version for the current KEK (default: `1`) |
| `JWT_SECRET` | Yes | ≥32-char secret for signing JWTs |
| `RESEND_API_KEY` | Yes | Resend email API key |
| `AUTH_PROVIDER` | No | `clerk` (default) or `better-auth` |
| `CLERK_SECRET_KEY` | Clerk only | Clerk backend secret key |
| `CLERK_PUBLISHABLE_KEY` | Clerk only | Clerk publishable key |
| `BETTER_AUTH_SECRET` | Better Auth only | Better Auth secret |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
| `LOGTAIL_SOURCE_TOKEN` | No | Logtail/Better Stack source token |
| `ENVIRONMENT` | No | `development` / `staging` / `production` |

In production, set secrets with:

```bash
wrangler secret put DATABASE_URL
wrangler secret put KEK_CURRENT
# etc.
```

---

## API Reference

All protected routes require a `Authorization: Bearer <token>` header.

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/auth/login` | Obtain access + refresh tokens |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Invalidate session |

### Protected (`/api/v1`)

All paths below are prefixed with `/api/v1`.

#### Providers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/providers/connections` | List user's AI provider connections |
| `POST` | `/providers/connections` | Add a connection (API key stored encrypted) |
| `PATCH` | `/providers/connections/:id` | Update connection |
| `DELETE` | `/providers/connections/:id` | Remove connection |
| `POST` | `/providers/connections/:id/test` | Test connectivity (fires a minimal request) |
| `GET` | `/providers/models` | List available AI models (`?providerType=openai&enabledOnly=true`) |

#### Proxy

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/proxy` | Proxy a completion request to an AI provider (streaming supported) |

#### Accessibility

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/accessibility/suggest` | Axe-core violation → structured AI remediation advice |

#### Users

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/me` | Get profile |
| `PATCH` | `/users/me` | Update profile |
| `GET` | `/users/me/export` | Export all user data (GDPR) |
| `POST` | `/users/me/deletion` | Request account deletion (30-day grace period) |
| `DELETE` | `/users/me/deletion` | Cancel pending deletion request |

#### Admin (role = `admin` required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/users` | List users (paginated, filterable by role) |
| `GET` | `/admin/users/:id` | Get single user |
| `POST` | `/admin/users/:id/block` | Block user (soft-delete) |
| `POST` | `/admin/users/:id/unblock` | Unblock user (restore) |
| `DELETE` | `/admin/users/:id` | Force-delete user immediately |
| `GET` | `/admin/models` | List global AI models |
| `POST` | `/admin/models` | Create model |
| `PATCH` | `/admin/models/:id` | Enable / disable model |
| `DELETE` | `/admin/models/:id` | Delete model |
| `GET` | `/admin/audit` | View audit log (paginated, filterable) |
| `GET` | `/admin/jobs` | List background jobs (`?name=&status=`) |
| `POST` | `/admin/jobs/run` | Trigger a job to run immediately |
| `GET` | `/admin/stats` | System stats (users, connections, usage, jobs) |
| `GET` | `/metrics` | Prometheus or JSON metrics (`?format=prometheus`) |

### Proxy request body

```json
{
  "connectionId": "uuid",
  "model": "gpt-4o",
  "messages": [{ "role": "user", "content": "..." }],
  "maxTokens": 1024,
  "temperature": 0.7,
  "stream": false
}
```

Supported providers: `openai`, `anthropic`, `openrouter`. Custom base URLs and headers are supported per connection.

---

## Database

Schema is managed with Drizzle Kit. Migrations are in `src/infrastructure/db/migrations/`.

```bash
npm run db:generate   # generate migration from schema changes
npm run db:migrate    # apply pending migrations
npm run db:push       # sync schema without migration files (dev only)
npm run db:studio     # open Drizzle Studio at localhost:4983
```

---

## Deployment

```bash
npm run deploy        # deploys to Cloudflare Workers (production)
```

For staging:

```bash
wrangler deploy --env staging
```

---

## Testing

```bash
npm run test          # run all tests once
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

Run a single file:

```bash
npx vitest run tests/path/to/file.test.ts
```

---

## License

MIT — see [LICENSE](../LICENSE) for details.

> This is an independent open-source project. Not affiliated with, endorsed by, or associated with Deque Systems or their products.
