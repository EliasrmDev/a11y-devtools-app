import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "../src/infrastructure/notifications/notification.service.js";
import type { EmailPort } from "../src/domain/ports/email.port.js";
import type { Database } from "../src/infrastructure/db/client.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockEmailPort(): EmailPort {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

/**
 * Build a minimal DB mock that lets each test control opt-out prefs and
 * reminder_jobs lookups independently via `prefsResult` and `reminderResult`.
 */
function makeDb(opts: {
  prefsResult?: Record<string, unknown>;
  reminderResult?: Record<string, unknown>;
} = {}): Database {
  const { prefsResult = null, reminderResult = null } = opts;

  let callCount = 0;
  const selectMock = vi.fn().mockImplementation(() => {
    callCount++;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(
            // First select = notification_preferences, second = reminder_jobs
            callCount === 1
              ? prefsResult
                ? [prefsResult]
                : []
              : reminderResult
              ? [reminderResult]
              : [],
          ),
        }),
      }),
    };
  });

  return {
    select: selectMock,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("NotificationService.sendKeyRotationReminder", () => {
  it("sends email when user has no prefs row", async () => {
    const email = mockEmailPort();
    const db = makeDb(); // empty prefs + empty reminder_jobs
    const svc = new NotificationService(db, email);

    await svc.sendKeyRotationReminder("user-1", "user@example.com", {
      displayName: "Alice",
      connectionName: "OpenAI",
      daysSinceRotation: 95,
    });

    expect(email.send).toHaveBeenCalledOnce();
    const args = (email.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("OpenAI");
  });

  it("skips send when user opted out (emailUsageReports = false)", async () => {
    const email = mockEmailPort();
    const db = makeDb({ prefsResult: { emailUsageReports: false, emailSecurityAlerts: true } });
    const svc = new NotificationService(db, email);

    await svc.sendKeyRotationReminder("user-1", "user@example.com", {
      displayName: "Alice",
      connectionName: "OpenAI",
      daysSinceRotation: 95,
    });

    expect(email.send).not.toHaveBeenCalled();
  });

  it("skips send when rate-limited (recent lastRunAt)", async () => {
    const email = mockEmailPort();
    const recentDate = new Date(Date.now() - 60_000); // 1 minute ago (< 24h)
    const db = makeDb({
      prefsResult: { emailUsageReports: true },
      reminderResult: { lastRunAt: recentDate },
    });
    const svc = new NotificationService(db, email);

    await svc.sendKeyRotationReminder("user-1", "user@example.com", {
      displayName: "Alice",
      connectionName: "OpenAI",
      daysSinceRotation: 95,
    });

    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("NotificationService.sendInvalidCredentialAlert", () => {
  it("sends alert email for invalid credential", async () => {
    const email = mockEmailPort();
    const db = makeDb();
    const svc = new NotificationService(db, email);

    await svc.sendInvalidCredentialAlert("user-1", "user@example.com", {
      displayName: "Bob",
      connectionName: "Anthropic Claude",
      providerType: "anthropic",
    });

    expect(email.send).toHaveBeenCalledOnce();
    const args = (email.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.subject).toContain("Anthropic Claude");
  });
});

describe("NotificationService.sendDeletionConfirmation", () => {
  it("bypasses opt-out and always sends", async () => {
    const email = mockEmailPort();
    // Prefs opted out
    const db = makeDb({
      prefsResult: {
        emailUsageReports: false,
        emailSecurityAlerts: false,
        emailProductUpdates: false,
      },
    });
    const svc = new NotificationService(db, email);

    await svc.sendDeletionConfirmation("user@example.com", {
      displayName: "Charlie",
      email: "user@example.com",
      requestedAt: new Date(),
    });

    // Email is always sent (transactional RTBF notification)
    expect(email.send).toHaveBeenCalledOnce();
    const args = (email.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("deleted");
  });
});

describe("NotificationService.sendInactiveAccountReminder", () => {
  it("sends reminder for inactive account", async () => {
    const email = mockEmailPort();
    const db = makeDb();
    const svc = new NotificationService(db, email);

    await svc.sendInactiveAccountReminder("user-1", "user@example.com", {
      displayName: "Diana",
      daysSinceLastActivity: 200,
    });

    expect(email.send).toHaveBeenCalledOnce();
  });
});
