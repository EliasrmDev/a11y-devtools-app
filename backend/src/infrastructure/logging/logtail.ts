/** Structured JSON logger with field sanitization for Logtail/Better Stack */

const SENSITIVE_FIELDS = new Set([
  "email",
  "password",
  "token",
  "tokenHash",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
  "authorization",
  "cookie",
  "encryptedDek",
  "dekIv",
  "ciphertext",
  "cipherIv",
  "authTag",
  "ipAddress",
  "ip_address",
  "providerAccountId",
  "providerEmail",
  "accessTokenEnc",
  "refreshTokenEnc",
  "customHeadersEnc",
  "baseUrl",
  "base_url",
  "metadata",
  "errorDetails",
  "token_jti",
  "tokenJti",
]);

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitize(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function createEntry(
  level: LogLevel,
  message: string,
  baseContext: Record<string, unknown>,
  context?: Record<string, unknown>,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitize(baseContext),
    ...(context ? sanitize(context) : {}),
  };
}

export function createLogger(
  baseContext: Record<string, unknown> = {},
): Logger {
  const log = (
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ) => {
    const entry = createEntry(level, message, baseContext, context);
    // In CF Workers, console.log writes to the Workers Logpush / Logtail drain
    switch (level) {
      case "debug":
        console.debug(JSON.stringify(entry));
        break;
      case "info":
        console.log(JSON.stringify(entry));
        break;
      case "warn":
        console.warn(JSON.stringify(entry));
        break;
      case "error":
        console.error(JSON.stringify(entry));
        break;
    }
  };

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context) => log("error", message, context),
    child: (childContext) =>
      createLogger({ ...baseContext, ...childContext }),
  };
}
