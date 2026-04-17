# Runbook: Data Deletion Incident

**Severity:** High  
**Impact:** User data deleted prematurely or unexpectedly; GDPR compliance risk.

---

## Scenarios

### A. User reports data deleted before 30-day grace period

1. **Check the deletion request record:**
   ```sql
   SELECT * FROM deletion_requests
   WHERE user_id = '<userId>'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

2. **Check audit events for the deletion:**
   ```sql
   SELECT * FROM audit_events
   WHERE resource_type = 'user'
     AND resource_id = '<userId>'
     AND action LIKE '%delet%'
   ORDER BY created_at DESC;
   ```

3. **Verify cron job behaviour:** The `PROCESS_DELETION_REQUESTS` job only processes rows where `scheduled_for <= NOW()`. If the timestamp was set incorrectly (e.g. to `NOW()` instead of `NOW() + 30 days`), the user would be deleted immediately.

4. **Restore if data still exists (soft-delete only):**
   ```sql
   UPDATE users SET deleted_at = NULL WHERE id = '<userId>';
   DELETE FROM deletion_requests WHERE user_id = '<userId>';
   ```
   Then call `POST /api/v1/admin/users/:id/unblock` to confirm via the application layer.

---

### B. Admin force-delete ran on the wrong user

1. Audit log will show `admin.user.force_delete`:
   ```sql
   SELECT * FROM audit_events
   WHERE action = 'admin.user.force_delete'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

2. If the hard-delete cron has not yet run (user is soft-deleted only), restore:
   ```sql
   UPDATE users SET deleted_at = NULL WHERE id = '<userId>';
   ```

3. If hard-delete has run, data is permanently gone. File an incident report and notify the user per GDPR Art. 33 if applicable.

---

### C. Bulk deletion triggered by bug

1. **Stop the cron from processing more deletions immediately** — trigger `ManageJobsUseCase` to skip `PROCESS_DELETION_REQUESTS`:
   ```sql
   UPDATE background_jobs
   SET status = 'dead'
   WHERE name = 'PROCESS_DELETION_REQUESTS'
     AND status = 'pending';
   ```

2. **Identify affected users** from `audit_events`.

3. **Restore soft-deleted users** that still have `deleted_at` set but no `deletion_requests` row.

4. **Fix the bug** and deploy before re-enabling the job.

---

## Post-incident

- If more than one user's data was permanently deleted due to a system error, this may constitute a personal data breach under GDPR Art. 33 (72-hour notification window to supervisory authority).
- Document: number of affected users, data categories affected, discovery time, containment time, root cause, corrective measures.
