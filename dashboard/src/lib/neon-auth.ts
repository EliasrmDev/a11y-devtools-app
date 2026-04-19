import { createAuthClient } from "@neondatabase/auth";
import { isNeonAuth } from "@/lib/auth-mode";

const NEON_AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;

const authClientBaseURL = NEON_AUTH_URL
  ? (import.meta.env.DEV ? `${window.location.origin}/auth-api` : NEON_AUTH_URL)
  : null;

function createUnavailableClient() {
  const unavailable = () => {
    throw new Error("Missing VITE_NEON_AUTH_URL env variable");
  };

  return {
    signIn: {
      email: unavailable,
      social: unavailable,
    },
    signUp: {
      email: unavailable,
    },
    getSession: unavailable,
    signOut: unavailable,
  };
}

if (isNeonAuth && !authClientBaseURL) {
  throw new Error("Missing VITE_NEON_AUTH_URL env variable");
}

export const authClient = authClientBaseURL
  ? createAuthClient(authClientBaseURL)
  : createUnavailableClient();

export const neonAuthURL = NEON_AUTH_URL;
