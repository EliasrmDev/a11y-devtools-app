# Runbook: Abuse Spike / Rate Limit Breach

**Severity:** Medium–High  
**Impact:** Elevated AI proxy costs, degraded service for legitimate users, potential provider account suspension.

---

## Indicators

- Cloudflare Worker invocations spike above normal baseline
- `usage_events` table shows a single `user_id` or `connection_id` with abnormally high request counts
- AI provider bills spike unexpectedly
- `RATE_LIMITER_PROXY` rejections appear in Worker logs

---

## Diagnosis

### Identify the offending user(s)

```sql
-- Top users by request count in the last hour
SELECT user_id, COUNT(*) AS requests, SUM(total_tokens) AS tokens
FROM usage_events
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
ORDER BY requests DESC
LIMIT 20;
```

### Check for errors indicating rate-limit bypass

```sql
SELECT action, COUNT(*) AS count
FROM audit_events
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY action
ORDER BY count DESC;
```

---

## Mitigation

### Block the offending user

```bash
# POST /api/v1/admin/users/:id/block
curl -X POST https://<api>/api/v1/admin/users/<userId>/block \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Abuse: automated request spike"}'
```

This soft-deletes the user (sets `deleted_at`). Their tokens remain in `revoked_tokens` after the next logout; pending sessions will fail auth middleware on the next request because `findById` returns `null` for deleted users.

### Tighten proxy rate limits temporarily

Update `wrangler.toml` `RATE_LIMITER_PROXY` limit and redeploy:

```toml
[[unsafe.bindings]]
name = "RATE_LIMITER_PROXY"
type = "ratelimit"
namespace_id = "1003"
simple = { limit = 5, period = 60 }   # reduce from 20
```

```bash
npm run deploy
```

### Revoke a specific provider connection

If only one connection is being abused (not the whole account):

```sql
UPDATE ai_provider_connections
SET is_active = FALSE
WHERE id = '<connection-id>';
```

---

## Recovery

1. Unblock the user once abuse is confirmed to have stopped:
   ```bash
   POST /api/v1/admin/users/:id/unblock
   ```

2. Restore rate limits to normal values and redeploy.

3. Review `audit_events` to determine whether the abuse was automated (bot) or manual.
