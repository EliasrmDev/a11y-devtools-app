# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo structure

Three independent sub-projects, each with its own dependencies and dev server:

| Directory   | What it is | Stack |
|-------------|------------|-------|
| `backend/`  | API server | Cloudflare Worker · Hono · Drizzle ORM · Neon Postgres |
| `dashboard/`| Admin/user web app | React 19 · Vite · Tailwind v4 · Clerk auth |
| `landing/`  | Marketing static site | Vanilla HTML/CSS/JS — no build step |

## Commands

### Backend (`cd backend`)

```bash
npm run dev          # wrangler dev (local Worker)
npm run deploy       # deploy to Cloudflare Workers (production)
npm run check        # typecheck + lint + tests — run before committing
npm run test         # vitest single pass
npm run test:watch   # vitest watch
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/

# DB (requires DATABASE_URL in .dev.vars)
npm run db:generate  # generate Drizzle migrations
npm run db:migrate   # apply migrations to DB
npm run db:push      # push schema without migration files (dev only)
npm run db:studio    # open Drizzle Studio GUI
```

Single test file: `npx vitest run tests/path/to/file.test.ts`  
Tests live in `tests/`, not `src/`.

### Dashboard (`cd dashboard`)

```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm run preview      # preview production build locally
```

### Landing (`cd landing`)

No build step. Serve directly:
```bash
npx serve .
```

## Backend architecture

See `backend/CLAUDE.md` for the full breakdown. Key points:

- **Clean architecture**: `domain → application → infrastructure ← adapters`
- **Result type** (`src/shared/result.ts`): use cases return `Result<T,E>` — check `.ok` before `.value`/`.error`, never throw
- **Auth**: pluggable via `AUTH_PROVIDER` env — `clerk` (prod/staging), `better-auth` (dev, per `wrangler.toml`), or `neon-auth` (Neon Auth managed service)
- **Envelope encryption**: provider API keys stored AES-256-GCM two-layer encrypted; `KEK_CURRENT` must be 32-byte base64

Local secrets go in `backend/.dev.vars` (Wrangler loads automatically, never commit this file).

## Dashboard architecture

- **Auth flow**: external identity (Clerk/Neon-Auth/Better-Auth) → `POST /auth/login` exchanges a provider JWT for backend access/refresh tokens stored in `localStorage` → `apiFetch` auto-refreshes on 401
- **`src/lib/api.ts`**: single file for all API calls, typed return values, handles token storage and refresh
- **`src/lib/auth.tsx`**: `AuthProvider` + `useAuth` hook — exposes `isAuthenticated`, `isAdmin`, `profile`, `loginWithClerk`, `logout`, `refreshProfile`
- **Route guards**: `RequireAuth` redirects to `/login`; `RequireAdmin` redirects to `/dashboard`
- **User routes** (`/dashboard/*`): overview, AI provider connections, profile/settings
- **Admin routes** (`/admin/*`): stats, users, models, audit log, job management — all require `role === "admin"`

Dashboard env vars (copy `.env.example` → `.env.local`):
- `VITE_API_URL` — backend URL
- `VITE_CLERK_PUBLISHABLE_KEY` — `pk_test_*` for dev, `pk_live_*` for prod (only if using Clerk auth)

## What the product is

a11y DevTools is a Chrome extension that scans pages for WCAG 2.1/2.2 AA violations using axe-core and returns AI-powered remediation suggestions. The extension repo is separate (`EliasrmDev/a11y-devtools-ext`). This repo holds the backend API and supporting web surfaces.
