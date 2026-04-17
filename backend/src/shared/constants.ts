/** Rate limit windows (requests per period) */
export const RATE_LIMITS = {
  AUTH: { limit: 5, periodSeconds: 60 },
  API: { limit: 60, periodSeconds: 60 },
  PROXY: { limit: 20, periodSeconds: 60 },
} as const;

/** Token lifetimes */
export const TOKEN_TTL = {
  ACCESS_TOKEN_SECONDS: 900, // 15 minutes
  REFRESH_TOKEN_SECONDS: 604_800, // 7 days
  SESSION_SECONDS: 86_400, // 24 hours (dashboard)
} as const;

/** Data retention */
export const RETENTION = {
  USAGE_EVENTS_DAYS: 90,
  AUDIT_EVENTS_DAYS: 365,
  REVOKED_TOKENS_CLEANUP_HOURS: 1,
  SESSION_CLEANUP_HOURS: 6,
  DELETION_GRACE_DAYS: 30,
} as const;

/** Request/response size limits */
export const SIZE_LIMITS = {
  MAX_REQUEST_BODY_BYTES: 65_536, // 64 KB
  MAX_RESPONSE_BODY_BYTES: 262_144, // 256 KB
  MAX_CUSTOM_HEADERS: 10,
  MAX_HEADER_NAME_LENGTH: 64,
  MAX_HEADER_VALUE_LENGTH: 512,
} as const;

/** AI proxy */
export const PROXY = {
  STREAM_TIMEOUT_MS: 300_000, // 5 minutes
  KNOWN_PROVIDERS: {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
    groq: "https://api.groq.com/openai/v1",
  },
} as const;

/** Auth lockout */
export const AUTH = {
  MAX_FAILED_ATTEMPTS: 10,
  LOCKOUT_SECONDS: 1_800, // 30 minutes
} as const;

/** pg-boss job processing */
export const JOBS = {
  BATCH_SIZE: 50,
  KEK_ROTATION_BATCH: 50,
} as const;

/** Accessibility suggestion proxy */
export const ACCESSIBILITY = {
  SUGGEST_TIMEOUT_MS: 30_000, // 30 seconds per attempt
  SUGGEST_MAX_RETRIES: 2,
  SELECTOR_MAX_LENGTH: 500,
  HTML_SNIPPET_MAX_LENGTH: 2_000,
  FAILURE_SUMMARY_MAX_LENGTH: 1_000,
  MAX_TOKENS: 1_024,
  TEMPERATURE: 0, // deterministic output for structured JSON
} as const;
