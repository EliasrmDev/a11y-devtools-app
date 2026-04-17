# Security Architecture

---

## Encryption at rest — Envelope encryption

All provider API keys and custom headers are stored using **AES-256-GCM envelope encryption** (`src/infrastructure/crypto/envelope-encryption.ts`).

**Two-layer scheme:**

```
plaintext
  → encrypted with a per-record Data Encryption Key (DEK)
      → DEK encrypted with the Key Encryption Key (KEK)
```

- The KEK never touches the database.
- Each record has a unique random DEK and IV.
- `kek_version` is stored alongside each ciphertext, enabling KEK rotation without re-encrypting all records at once.
- DEK is zeroed from memory immediately after use.

**KEK management:**

- `KEK_CURRENT` env var holds the active KEK (32 bytes, base64-encoded).
- `KEK_VERSION` (integer, default 1) identifies the current KEK.
- To rotate: add the new KEK as `KEK_CURRENT` with an incremented `KEK_VERSION`, then run a background migration to re-wrap DEKs. The `EnvelopeEncryption.rotateDek()` method handles individual record re-wrapping.

---

## Token security

- Access tokens: short-lived (15 minutes), JWT signed with `JWT_SECRET`.
- Refresh tokens: 7-day TTL, single-use.
- Logout invalidates tokens by inserting the JTI hash into `revoked_tokens`. `VerifyTokenUseCase` checks this blocklist on every request.
- The `CLEANUP_EXPIRED_TOKENS` cron job purges expired rows from `revoked_tokens` hourly.
- Failed login attempts are tracked; accounts lock after 10 failures for 30 minutes.

---

## SSRF prevention

`src/infrastructure/ai-providers/ssrf-guard.ts` validates every AI provider URL before a request is made:

- HTTPS only (no HTTP, no `file://`, etc.)
- Blocks private RFC 1918 ranges, loopback, link-local
- Blocks known cloud metadata endpoints (AWS/GCP `169.254.169.254`, Alibaba `100.100.100.200`, Google `metadata.google.internal`)
- Blocks embedded credentials in URLs (`user:pass@host`)
- Allows only standard HTTPS ports (443, 8443)

---

## Rate limiting

Three Cloudflare-native rate limiters (not in-process — enforced at the edge before the Worker runs):

| Limiter | Limit | Scope |
|---------|-------|-------|
| `RATE_LIMITER_AUTH` | 5 req / 60 s | Login, refresh, logout |
| `RATE_LIMITER_API` | 60 req / 60 s | Provider CRUD, admin endpoints |
| `RATE_LIMITER_PROXY` | 20 req / 60 s | AI proxy, accessibility suggest |

---

## Audit log

Every sensitive mutation is recorded in `audit_events` with:

- `userId` — who performed the action
- `action` — machine-readable event code (e.g. `provider.created`, `admin.user.block`)
- `resourceType` / `resourceId` — what was affected
- `ipAddress` / `userAgent` — request metadata
- `metadata` — action-specific payload (never contains plaintext secrets)

Audit events are immutable — there is no update or delete path through the application layer. Retention: 365 days (cleaned by cron).

---

## Admin access control

The `adminMiddleware` (`src/adapters/middleware/admin.middleware.ts`) checks `user.role === 'admin'` on all `/admin/*` and `/metrics` routes. Role is stored in the `users` table and is not derived from the JWT — it is re-checked against the database on each request.

---

## Input validation

All request bodies are validated with Zod schemas defined in `src/application/dto/`. Invalid requests are rejected at the route layer before reaching any use case. Size limits are enforced globally:

- Max request body: 64 KB
- Max custom headers per connection: 10
- Max header name length: 64 chars / value: 512 chars
- Accessibility suggest: selector ≤ 500 chars, HTML snippet ≤ 2 000 chars, failure summary ≤ 1 000 chars

---

## AI prompt injection

The accessibility suggest endpoint (`SuggestAccessibilityUseCase`) builds prompts via `buildAccessibilityPrompt()` in `src/infrastructure/ai-providers/accessibility-prompt.ts`. User-supplied content (selector, HTML, failure summary) is inserted into a structured prompt template with length limits enforced at the DTO level. The AI response is parsed against a strict Zod schema — responses that don't conform are rejected with `INVALID_AI_RESPONSE`.

---

## GDPR / data deletion

- Users may request deletion via `POST /api/v1/users/me/deletion`.
- A 30-day grace period applies (cancellable via `DELETE /api/v1/users/me/deletion`).
- After the grace period the `PROCESS_DELETION_REQUESTS` cron job hard-deletes the user and all associated data.
- Admins can force-delete immediately via `DELETE /api/v1/admin/users/:id`.
- Data export (`GET /api/v1/users/me/export`) returns all stored user data as JSON.
