# Runbook: Auth Outage

**Severity:** High  
**Impact:** Users cannot log in or refresh tokens; all authenticated API calls return 401.

---

## Diagnosis

### 1. Identify the active auth provider

```bash
wrangler secret list   # check AUTH_PROVIDER
```

Default per environment (`wrangler.toml`): `clerk` in production/staging, `better-auth` in dev. `neon-auth` is also supported in any environment.

### 2. Clerk outage

- Check [https://status.clerk.com](https://status.clerk.com).
- Check Cloudflare Worker error rates on `/auth/*` routes in the dashboard.

### 3. JWT_SECRET rotated unexpectedly

All existing tokens are immediately invalid after `JWT_SECRET` changes. Verify it's set:
```bash
wrangler secret list
```

### 4. Revoked tokens table bloat

An accidental bulk insert into `revoked_tokens` would make every JTI appear revoked. Check row count:
```sql
SELECT COUNT(*) FROM revoked_tokens WHERE expires_at > NOW();
```

---

## Mitigation

### Clerk outage → switch to Better Auth or Neon Auth

**Better Auth:**
```bash
wrangler secret put AUTH_PROVIDER        # "better-auth"
wrangler secret put BETTER_AUTH_SECRET   # new random secret
npm run deploy
```

**Neon Auth:**
```bash
wrangler secret put AUTH_PROVIDER        # "neon-auth"
wrangler secret put NEON_AUTH_JWKS_URL   # Neon Auth JWKS endpoint
wrangler secret put NEON_AUTH_BASE_URL   # Neon Auth base URL
npm run deploy
```

Users must re-authenticate in all cases — tokens from one provider are not valid under another. Revert once the original provider recovers.

### JWT_SECRET accidentally overwritten

```bash
wrangler secret put JWT_SECRET   # new strong secret
npm run deploy
```

All existing tokens are invalidated — users must log in again.

### Revoked tokens table corrupted

Targeted cleanup (only if you can identify the bad rows by timestamp):
```sql
DELETE FROM revoked_tokens WHERE created_at > '<incident-start>';
```

Never truncate the whole table — legitimate revocations would be lost and logged-out tokens would become valid again.

---

## Recovery verification

1. `POST /auth/login` → 200 with `accessToken` + `refreshToken`.
2. `GET /api/v1/users/me` with the new token → 200.
3. Monitor Worker 4xx/5xx rate in the Cloudflare dashboard — should drop to baseline within 2–3 minutes of deploy.
