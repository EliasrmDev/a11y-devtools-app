# Runbook: AI Provider Outage

**Severity:** Medium  
**Impact:** `POST /api/v1/proxy` and `POST /api/v1/accessibility/suggest` fail for affected provider.

---

## Indicators

- `usage_events` rows with `status = 'error'` and `error_code = 'PROVIDER_ERROR_5XX'` spike for a specific `connection_id` / `model_id`
- Users report "Provider returned an error" responses from the proxy
- AI provider status page shows an incident

---

## Diagnosis

### Identify which provider is failing

```sql
SELECT
  c.provider_type,
  u.error_code,
  COUNT(*) AS count
FROM usage_events u
JOIN ai_provider_connections c ON c.id = u.connection_id
WHERE u.created_at > NOW() - INTERVAL '30 minutes'
  AND u.status = 'error'
GROUP BY c.provider_type, u.error_code
ORDER BY count DESC;
```

### Check provider status pages

- OpenAI: [https://status.openai.com](https://status.openai.com)
- Anthropic: [https://status.anthropic.com](https://status.anthropic.com)
- OpenRouter: [https://status.openrouter.ai](https://status.openrouter.ai)

### Test a specific connection

```bash
POST /api/v1/providers/connections/<id>/test
Authorization: Bearer <user-token>
```

Returns `{ success, latencyMs, error? }`.

---

## Mitigation

### Inform users

The proxy surfaces provider errors directly to the client as structured error responses. No action required on the API side — the outage is at the provider level.

If the outage is prolonged, consider posting a status update through your communication channel.

### Disable a broken connection (admin)

If a specific connection is producing errors and the user has not noticed:

```sql
UPDATE ai_provider_connections
SET is_active = FALSE
WHERE id = '<connection-id>';
```

The `REMINDER_INVALID_CREDENTIAL` cron job automatically detects connections that have been consistently failing and notifies the user.

### Accessibility suggest retry behaviour

`SuggestAccessibilityUseCase` retries up to 2 times on transient errors (`PROVIDER_TIMEOUT`, `PROVIDER_ERROR_5XX`) with exponential back-off (1 s → 2 s). If all retries fail, a structured error is returned to the client — no data loss.

---

## Recovery verification

1. Run `POST /api/v1/providers/connections/<id>/test` for the affected provider — should return `{ success: true }`.
2. Check `usage_events` — `status = 'error'` rate should drop to baseline.
3. Monitor `audit_events` for `provider.test_success` events confirming recovery.
