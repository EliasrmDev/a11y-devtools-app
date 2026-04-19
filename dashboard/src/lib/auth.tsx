import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useClerk, useSession, useUser } from "@clerk/clerk-react";
import { login, logout as apiLogout, getDeletionStatus, getProfile, getTokens, clearTokens, type ActiveDeletion, type Profile } from "@/lib/api";
import { FRONTEND_AUTH_PROVIDER, isClerkAuth } from "@/lib/auth-mode";
import { authClient } from "@/lib/neon-auth";

interface AuthState {
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  error: string | null;
  retryCount: number;
  activeDeletion: ActiveDeletion | null;
  setActiveDeletion: (d: ActiveDeletion | null) => void;
  loginWithClerk: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  loginWithOAuth: (provider: "google" | "github") => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryConnection: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function exchangeSessionToken(token: string) {
  const result = await login(token);
  return {
    id: result.user.id,
    email: result.user.email,
    displayName: result.user.displayName,
    avatarUrl: null,
    role: result.user.role,
    emailVerifiedAt: null,
    createdAt: new Date().toISOString(),
  } satisfies Profile;
}

async function syncDeletionStatus(setActiveDeletion: (d: ActiveDeletion | null) => void) {
  try {
    const response = await getDeletionStatus();
    setActiveDeletion(response.deletion);
  } catch {
    setActiveDeletion(null);
  }
}

function buildConnectionError(err: unknown, fallbackPrefix: string) {
  const message = err instanceof Error ? err.message : "Unknown error occurred";

  if (message.includes("fetch") || message.includes("network") || message.includes("Failed to fetch")) {
    return "Unable to connect to backend. Please check your connection and try again.";
  }

  return `${fallbackPrefix}: ${message}`;
}

function notAvailable(method: string) {
  return async () => {
    throw new Error(`${method} is not available when VITE_AUTH_PROVIDER=${FRONTEND_AUTH_PROVIDER}`);
  };
}

function ClerkAuthProviderInternal({ children }: { children: ReactNode }) {
  const { isSignedIn, user } = useUser();
  const { session } = useSession();
  const clerk = useClerk();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [activeDeletion, setActiveDeletion] = useState<ActiveDeletion | null>(null);
  const initializingRef = useRef(false);
  const maxRetryAttempts = 3;

  const loginWithClerk = useCallback(async () => {
    if (!session) return;

    try {
      setError(null);
      const token = await session.getToken();
      if (!token) return;

      const result = await login(token);
      setProfile({
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        avatarUrl: user?.imageUrl ?? null,
        role: result.user.role,
        emailVerifiedAt: null,
        createdAt: new Date().toISOString(),
      });
      setRetryCount(0);
      await syncDeletionStatus(setActiveDeletion);
    } catch (err) {
      console.error("Backend login failed:", err);
      setError(buildConnectionError(err, "Login failed"));
      throw err;
    }
  }, [session, user]);

  const refreshProfile = useCallback(async () => {
    try {
      setError(null);
      const nextProfile = await getProfile();
      setProfile(nextProfile);
      await syncDeletionStatus(setActiveDeletion);
    } catch (err) {
      console.error("Profile refresh failed:", err);
      setProfile(null);
      clearTokens();
      setError(buildConnectionError(err, "Profile refresh failed"));
    }
  }, []);

  const retryConnection = useCallback(() => {
    setError(null);
    setRetryCount(0);
    initializingRef.current = false;

    if (isSignedIn && session) {
      initializingRef.current = true;

      async function retryInit() {
        setIsLoading(true);
        try {
          await loginWithClerk();
        } catch (err) {
          console.error("Retry connection failed:", err);
        } finally {
          setIsLoading(false);
          initializingRef.current = false;
        }
      }

      retryInit();
    }
  }, [isSignedIn, session, loginWithClerk]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.error("Backend logout failed:", err);
    } finally {
      setProfile(null);
      setError(null);
      setRetryCount(0);
      setActiveDeletion(null);

      try {
        await clerk.signOut();
      } catch (err) {
        console.error("Clerk signout failed:", err);
      }
    }
  }, [clerk]);

  useEffect(() => {
    if (isSignedIn === undefined) return;
    if (initializingRef.current) return;
    if (error && retryCount >= maxRetryAttempts) return;

    initializingRef.current = true;

    async function init() {
      setIsLoading(true);
      try {
        const tokens = getTokens();
        if (tokens?.accessToken) {
          const nextProfile = await getProfile();
          setProfile(nextProfile);
          setError(null);
          setRetryCount(0);
          await syncDeletionStatus(setActiveDeletion);
        } else if (isSignedIn && session && retryCount < maxRetryAttempts) {
          await loginWithClerk();
        }
      } catch (err) {
        clearTokens();
        setProfile(null);
        setActiveDeletion(null);

        if (retryCount < maxRetryAttempts) {
          setRetryCount((current) => current + 1);
          console.warn(`Login attempt ${retryCount + 1}/${maxRetryAttempts} failed:`, err);
        } else {
          console.error("Max retry attempts reached. Stopping auto-retry.", err);
        }
      } finally {
        setIsLoading(false);
        initializingRef.current = false;
      }
    }

    init();
  }, [isSignedIn, retryCount]);

  return (
    <AuthContext.Provider
      value={{
        profile,
        isLoading,
        isAuthenticated: !!profile,
        isAdmin: profile?.role === "admin",
        error,
        retryCount,
        activeDeletion,
        setActiveDeletion,
        loginWithClerk,
        loginWithEmail: notAvailable("Email login"),
        signUpWithEmail: notAvailable("Email signup"),
        loginWithOAuth: notAvailable("OAuth login"),
        logout,
        refreshProfile,
        retryConnection,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function NeonAuthProviderInternal({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [activeDeletion, setActiveDeletion] = useState<ActiveDeletion | null>(null);
  const initializingRef = useRef(false);

  const loginWithClerk = useCallback(notAvailable("Clerk login"), []);

  const loginWithOAuth = useCallback(async (provider: "google" | "github") => {
    await authClient.signIn.social({
      provider,
      callbackURL: window.location.origin + "/dashboard",
    });
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      const response = await authClient.signIn.email({ email, password });
      if (response.error) throw new Error(response.error.message ?? "Sign in failed");

      const session = await authClient.getSession();
      const token = (session as any).data?.session?.token
        ?? (session as any).data?.token
        ?? (response as any).data?.token;
      if (!token) throw new Error("Unable to retrieve session token");

      const nextProfile = await exchangeSessionToken(token);
      setProfile(nextProfile);
      setRetryCount(0);
      await syncDeletionStatus(setActiveDeletion);
    } catch (err) {
      console.error("Login failed:", err);
      setError(buildConnectionError(err, "Login failed"));
      throw err;
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, name: string) => {
    try {
      setError(null);
      const response = await authClient.signUp.email({ email, password, name });
      if (response.error) throw new Error(response.error.message ?? "Sign up failed");

      const session = await authClient.getSession();
      const token = (session as any).data?.session?.token
        ?? (session as any).data?.token
        ?? (response as any).data?.token;
      if (!token) throw new Error("Unable to retrieve session token");

      const nextProfile = await exchangeSessionToken(token);
      setProfile(nextProfile);
      setRetryCount(0);
      await syncDeletionStatus(setActiveDeletion);
    } catch (err) {
      console.error("Sign up failed:", err);
      setError(buildConnectionError(err, "Sign up failed"));
      throw err;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      setError(null);
      const nextProfile = await getProfile();
      setProfile(nextProfile);
      await syncDeletionStatus(setActiveDeletion);
    } catch (err) {
      console.error("Profile refresh failed:", err);
      setProfile(null);
      clearTokens();
      setError(buildConnectionError(err, "Profile refresh failed"));
    }
  }, []);

  const retryConnection = useCallback(() => {
    setError(null);
    setRetryCount(0);
    initializingRef.current = false;
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.error("Backend logout failed:", err);
    } finally {
      setProfile(null);
      setError(null);
      setRetryCount(0);
      setActiveDeletion(null);
      try {
        await authClient.signOut();
      } catch (err) {
        console.error("Neon Auth signout failed:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    async function init() {
      setIsLoading(true);
      try {
        const tokens = getTokens();
        if (tokens?.accessToken) {
          const nextProfile = await getProfile();
          setProfile(nextProfile);
          setError(null);
          setRetryCount(0);
          await syncDeletionStatus(setActiveDeletion);
        } else {
          const session = await authClient.getSession();
          const token = (session as any).data?.session?.token ?? (session as any).data?.token;
          if (token) {
            const nextProfile = await exchangeSessionToken(token);
            setProfile(nextProfile);
            setRetryCount(0);
            await syncDeletionStatus(setActiveDeletion);
          }
        }
      } catch (err) {
        clearTokens();
        setProfile(null);
        setActiveDeletion(null);
        console.warn("Auth initialization failed:", err);
      } finally {
        setIsLoading(false);
        initializingRef.current = false;
      }
    }

    init();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        profile,
        isLoading,
        isAuthenticated: !!profile,
        isAdmin: profile?.role === "admin",
        error,
        retryCount,
        activeDeletion,
        setActiveDeletion,
        loginWithClerk,
        loginWithEmail,
        signUpWithEmail,
        loginWithOAuth,
        logout,
        refreshProfile,
        retryConnection,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return isClerkAuth
    ? <ClerkAuthProviderInternal>{children}</ClerkAuthProviderInternal>
    : <NeonAuthProviderInternal>{children}</NeonAuthProviderInternal>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
