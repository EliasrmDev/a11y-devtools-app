# Runbook: KEK Compromise or Suspected Leak

**Severity:** Critical  
**Impact:** All provider API keys stored in the database may be readable to an attacker.

---

## Immediate actions (< 15 minutes)

1. **Generate a new KEK:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

2. **Preserve the old KEK** as a secondary secret before overwriting it (needed to decrypt existing envelopes during migration). Add it as `KEK_V1` (or the version it was):
   ```bash
   wrangler secret put KEK_V1          # paste the old KEK_CURRENT value
   ```

3. **Set the new KEK and increment the version:**
   ```bash
   wrangler secret put KEK_CURRENT     # paste the new key
   wrangler secret put KEK_VERSION     # increment by 1, e.g. "2"
   ```

4. **Update `app.ts`** to register the old KEK version with `crypto.addKekVersion(1, env.KEK_V1)` so existing records can still be decrypted. Deploy:
   ```bash
   npm run deploy
   ```

5. **Invalidate all sessions** by rotating `JWT_SECRET`:
   ```bash
   wrangler secret put JWT_SECRET      # generate a new 64-char random string
   npm run deploy
   ```

6. **Notify users** to revoke and replace any API keys they had registered.

---

## Re-encryption migration

Once the new KEK is live, re-wrap all DEKs in `encrypted_secrets`:

1. Write a one-off script that for each row:
   - Calls `EnvelopeEncryption.rotateDek(envelope, newKekVersion)` (decrypts DEK with old KEK, re-encrypts with new KEK)
   - Writes back `encryptedDek`, `dekIv`, `kekVersion`

2. Run with both versions available (`KEK_V1` + `KEK_CURRENT`).

3. Once all rows show `kek_version = <new version>`, remove `KEK_V1` from Worker secrets and redeploy.

---

## Post-incident

- Query `audit_events` for `provider.*` actions between suspected compromise and rotation timestamp.
- File an incident report: compromise window, affected records count, remediation timeline.
- Identify the root cause (env var exposure, log scraping, repo leak) and address it.
