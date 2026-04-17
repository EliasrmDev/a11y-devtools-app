import type { AuthPort } from "../../domain/ports/auth.port.js";
import type { Env } from "../../env.js";
import { ClerkAuthAdapter } from "./clerk.adapter.js";
import { BetterAuthAdapter } from "./better-auth.adapter.js";

export function createAuthAdapter(env: Env): AuthPort {
  switch (env.AUTH_PROVIDER) {
    case "clerk":
      if (!env.CLERK_SECRET_KEY) {
        throw new Error("CLERK_SECRET_KEY is required when AUTH_PROVIDER=clerk");
      }
      return new ClerkAuthAdapter(env.JWT_SECRET, env.CLERK_SECRET_KEY);

    case "better-auth":
      if (!env.BETTER_AUTH_SECRET) {
        throw new Error(
          "BETTER_AUTH_SECRET is required when AUTH_PROVIDER=better-auth",
        );
      }
      return new BetterAuthAdapter(env.JWT_SECRET, env.BETTER_AUTH_SECRET);

    default:
      throw new Error(`Unknown AUTH_PROVIDER: ${env.AUTH_PROVIDER}`);
  }
}
