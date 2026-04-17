/**
 * Email templates for transactional notifications.
 *
 * Guidelines:
 * - Inline CSS only (no external stylesheets)
 * - No tracking pixels, no external resources
 * - No secrets or sensitive data
 * - Plain-text fallback in each template return
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const BRAND = {
  name: "a11y DevTools",
  color: "#4f46e5",
  supportEmail: "support@a11ydevtools.app",
};

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f9fafb;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.color};padding:24px 32px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;">${BRAND.name}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
              You received this email because you have an account with ${BRAND.name}.
              Need help? Contact <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.color};">${BRAND.supportEmail}</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Template definitions ────────────────────────────────────────────────────

export interface KeyRotationData {
  displayName: string;
  connectionName: string;
  daysSinceRotation: number;
}

export function keyRotationReminder(data: KeyRotationData): EmailTemplate {
  const subject = `Action recommended: rotate your API key for "${data.connectionName}"`;

  const html = baseLayout(
    subject,
    `<h2 style="margin:0 0 16px;font-size:20px;color:#111827;">API Key Rotation Recommended</h2>
    <p style="margin:0 0 16px;line-height:1.6;">
      Hi ${data.displayName},
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Your API key for the connection <strong>"${data.connectionName}"</strong> hasn't been
      rotated in <strong>${data.daysSinceRotation} days</strong>.
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Rotating API keys regularly reduces the impact of accidental exposure.
      We recommend rotating your key every 90 days.
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Sign in to your dashboard to generate a new key and update your connection settings.
    </p>`,
  );

  const text = `API Key Rotation Recommended

Hi ${data.displayName},

Your API key for "${data.connectionName}" hasn't been rotated in ${data.daysSinceRotation} days.

Rotating API keys regularly reduces the impact of accidental exposure.
We recommend rotating your key every 90 days.

Sign in to your dashboard to update your connection settings.

---
${BRAND.name} | ${BRAND.supportEmail}`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface InvalidCredentialData {
  displayName: string;
  connectionName: string;
  providerType: string;
}

export function invalidCredentialAlert(data: InvalidCredentialData): EmailTemplate {
  const subject = `Security alert: invalid credential detected for "${data.connectionName}"`;

  const html = baseLayout(
    subject,
    `<h2 style="margin:0 0 16px;font-size:20px;color:#b91c1c;">Invalid Credential Detected</h2>
    <p style="margin:0 0 16px;line-height:1.6;">
      Hi ${data.displayName},
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      We detected that the API key for your <strong>${data.providerType}</strong> connection
      <strong>"${data.connectionName}"</strong> is no longer valid.
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Please update your credentials to restore access. If you did not revoke this key,
      check your provider account for unauthorized activity.
    </p>`,
  );

  const text = `Security Alert: Invalid Credential Detected

Hi ${data.displayName},

The API key for your ${data.providerType} connection "${data.connectionName}" is no longer valid.

Please update your credentials to restore access.
If you did not revoke this key, check your provider account for unauthorized activity.

---
${BRAND.name} | ${BRAND.supportEmail}`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface InactiveAccountData {
  displayName: string;
  daysSinceLastActivity: number;
}

export function inactiveAccountReminder(data: InactiveAccountData): EmailTemplate {
  const subject = `We miss you — your ${BRAND.name} account has been inactive`;

  const html = baseLayout(
    subject,
    `<h2 style="margin:0 0 16px;font-size:20px;color:#111827;">It's been a while!</h2>
    <p style="margin:0 0 16px;line-height:1.6;">
      Hi ${data.displayName},
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Your ${BRAND.name} account has had no activity for
      <strong>${data.daysSinceLastActivity} days</strong>.
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Sign back in anytime — your connections and settings are still here.
    </p>`,
  );

  const text = `We miss you!

Hi ${data.displayName},

Your ${BRAND.name} account has had no activity for ${data.daysSinceLastActivity} days.
Sign back in anytime — your connections and settings are still here.

---
${BRAND.name} | ${BRAND.supportEmail}`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface DeletionConfirmationData {
  displayName: string;
  email: string;
  requestedAt: Date;
}

export function deletionConfirmation(data: DeletionConfirmationData): EmailTemplate {
  const subject = `Your ${BRAND.name} account has been permanently deleted`;

  const html = baseLayout(
    subject,
    `<h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Account Deletion Confirmed</h2>
    <p style="margin:0 0 16px;line-height:1.6;">
      Hi ${data.displayName},
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Your ${BRAND.name} account and all associated data have been permanently and
      irreversibly deleted as of ${new Date().toUTCString()}.
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Deletion was requested on ${data.requestedAt.toUTCString()}.
    </p>
    <p style="margin:0 0 16px;line-height:1.6;">
      Thank you for using ${BRAND.name}. If you have any questions, contact us at
      <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.color};">${BRAND.supportEmail}</a>.
    </p>`,
  );

  const text = `Account Deletion Confirmed

Hi ${data.displayName},

Your ${BRAND.name} account and all associated data have been permanently deleted as of ${new Date().toUTCString()}.

Deletion was requested on ${data.requestedAt.toUTCString()}.

If you have questions, contact ${BRAND.supportEmail}.

---
${BRAND.name}`;

  return { subject, html, text };
}
