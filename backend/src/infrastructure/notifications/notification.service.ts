import type { EmailPort } from "../../domain/ports/email.port.js";
import type { Database } from "../db/client.js";
import { notificationPreferences } from "../db/schema/notification-preferences.js";
import { reminderJobs } from "../db/schema/reminder-jobs.js";
import { eq, and, gt } from "drizzle-orm";
import {
  keyRotationReminder,
  invalidCredentialAlert,
  inactiveAccountReminder,
  deletionConfirmation,
  type KeyRotationData,
  type InvalidCredentialData,
  type InactiveAccountData,
  type DeletionConfirmationData,
} from "./email-templates.js";

export type ReminderType =
  | "REMINDER_KEY_ROTATION"
  | "REMINDER_INVALID_CREDENTIAL"
  | "DETECT_INACTIVE_ACCOUNTS";

/** How often (ms) each reminder type may be sent per user (rate limit window). */
const RATE_LIMIT_MS: Record<ReminderType, number> = {
  REMINDER_KEY_ROTATION: 24 * 60 * 60_000,      // 1 day
  REMINDER_INVALID_CREDENTIAL: 4 * 60 * 60_000, // 4 hours (security alert)
  DETECT_INACTIVE_ACCOUNTS: 7 * 24 * 60 * 60_000, // 7 days
};

/**
 * Maps a reminder type to the `notification_preferences` column
 * that controls it. `false` = user has opted out.
 */
const OPT_OUT_COLUMN: Record<ReminderType, keyof typeof _PREFS_COLS> = {
  REMINDER_KEY_ROTATION: "emailUsageReports",
  REMINDER_INVALID_CREDENTIAL: "emailSecurityAlerts",
  DETECT_INACTIVE_ACCOUNTS: "emailUsageReports",
};

// Helper used only for typing — never called at runtime
const _PREFS_COLS = {
  emailUsageReports: true,
  emailSecurityAlerts: true,
  emailProductUpdates: true,
} as const;

/**
 * Central notification service.
 *
 * Responsibilities:
 * - Check user opt-out preferences before sending
 * - Rate-limit reminders per user+type via reminder_jobs.lastRunAt
 * - Delegate sending to the EmailPort (Resend)
 * - Update reminder_jobs.lastRunAt after a successful send
 */
export class NotificationService {
  constructor(
    private readonly db: Database,
    private readonly email: EmailPort,
  ) {}

  // ─── Public send methods ──────────────────────────────────────────────────

  async sendKeyRotationReminder(
    userId: string,
    to: string,
    data: KeyRotationData,
  ): Promise<void> {
    await this._send(userId, to, "REMINDER_KEY_ROTATION", () =>
      keyRotationReminder(data),
    );
  }

  async sendInvalidCredentialAlert(
    userId: string,
    to: string,
    data: InvalidCredentialData,
  ): Promise<void> {
    await this._send(userId, to, "REMINDER_INVALID_CREDENTIAL", () =>
      invalidCredentialAlert(data),
    );
  }

  async sendInactiveAccountReminder(
    userId: string,
    to: string,
    data: InactiveAccountData,
  ): Promise<void> {
    await this._send(userId, to, "DETECT_INACTIVE_ACCOUNTS", () =>
      inactiveAccountReminder(data),
    );
  }

  /**
   * Deletion confirmation bypasses rate limiting and opt-out — it is
   * a transactional notification required by RTBF obligations.
   */
  async sendDeletionConfirmation(
    to: string,
    data: DeletionConfirmationData,
  ): Promise<void> {
    const template = deletionConfirmation(data);
    await this.email.send({
      to,
      subject: template.subject,
      html: template.html,
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async _send(
    userId: string,
    to: string,
    type: ReminderType,
    buildTemplate: () => { subject: string; html: string },
  ): Promise<void> {
    if (await this._isOptedOut(userId, type)) return;
    if (await this._isRateLimited(userId, type)) return;

    const template = buildTemplate();
    await this.email.send({ to, subject: template.subject, html: template.html });
    await this._recordSent(userId, type);
  }

  private async _isOptedOut(userId: string, type: ReminderType): Promise<boolean> {
    const column = OPT_OUT_COLUMN[type];

    const [prefs] = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (!prefs) return false; // No preferences row → use defaults (not opted out)

    return prefs[column] === false;
  }

  private async _isRateLimited(userId: string, type: ReminderType): Promise<boolean> {
    const windowMs = RATE_LIMIT_MS[type];
    const since = new Date(Date.now() - windowMs);

    const [recent] = await this.db
      .select({ lastRunAt: reminderJobs.lastRunAt })
      .from(reminderJobs)
      .where(
        and(
          eq(reminderJobs.userId, userId),
          eq(reminderJobs.jobType, type),
          gt(reminderJobs.lastRunAt, since),
        ),
      )
      .limit(1);

    return Boolean(recent);
  }

  private async _recordSent(userId: string, type: ReminderType): Promise<void> {
    const now = new Date();
    const nextRun = new Date(now.getTime() + RATE_LIMIT_MS[type]);

    // Upsert into reminder_jobs — update existing row or insert new one
    const [existing] = await this.db
      .select({ id: reminderJobs.id })
      .from(reminderJobs)
      .where(and(eq(reminderJobs.userId, userId), eq(reminderJobs.jobType, type)))
      .limit(1);

    if (existing) {
      await this.db
        .update(reminderJobs)
        .set({ lastRunAt: now, nextRunAt: nextRun, updatedAt: now })
        .where(eq(reminderJobs.id, existing.id));
    } else {
      await this.db.insert(reminderJobs).values({
        userId,
        jobType: type,
        nextRunAt: nextRun,
        lastRunAt: now,
        status: "active",
      });
    }
  }
}
