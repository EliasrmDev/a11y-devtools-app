export type FrontendAuthProvider = "clerk" | "neon";

const rawProvider = import.meta.env.VITE_AUTH_PROVIDER;

export const FRONTEND_AUTH_PROVIDER: FrontendAuthProvider =
  rawProvider === "neon" ? "neon" : "clerk";

export const isClerkAuth = FRONTEND_AUTH_PROVIDER === "clerk";
export const isNeonAuth = FRONTEND_AUTH_PROVIDER === "neon";