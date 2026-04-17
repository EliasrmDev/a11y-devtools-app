import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  KEK_CURRENT: z.string().min(1),
  KEK_VERSION: z.coerce.number().int().positive().default(1),
  AUTH_PROVIDER: z.enum(["clerk", "better-auth"]).default("clerk"),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().min(1),
  LOGTAIL_SOURCE_TOKEN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default(""),
  ALLOWED_ORIGINS_DEV: z.string().default(""),
  ENVIRONMENT: z
    .enum(["development", "staging", "production"])
    .default("production"),
});

export type Env = z.infer<typeof envSchema>;

export interface CloudflareBindings extends Env {
  RATE_LIMITER_AUTH: RateLimit;
  RATE_LIMITER_API: RateLimit;
  RATE_LIMITER_PROXY: RateLimit;
  /** Cloudflare Workers AI binding — available when [ai] is set in wrangler.toml */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AI?: { run(model: string, input: Record<string, unknown>): Promise<any> };
}

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export function parseEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
