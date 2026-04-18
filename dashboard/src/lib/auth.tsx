import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useUser, useSession, useClerk } from "@clerk/clerk-react";
import { login, logout as apiLogout, getProfile, getTokens, clearTokens, type Profile } from "@/lib/api";

interface AuthState {
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  error: string | null;
  retryCount: number;
  loginWithClerk: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryConnection: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, user } = useUser();
  const { session } = useSession();
  const clerk = useClerk();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const initializingRef = useRef(false);
  const MAX_RETRY_ATTEMPTS = 3;

  const loginWithClerk = useCallback(async () => {
    if (!session) return;
    try {
      setError(null); // Clear any previous errors
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
      setRetryCount(0); // Reset retry count on success
    } catch (err) {
      console.error("Backend login failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";

      // Only set error if it's a connection issue
      if (errorMessage.includes("fetch") || errorMessage.includes("network") || errorMessage.includes("Failed to fetch")) {
        setError("Unable to connect to backend. Please check your connection and try again.");
      } else {
        setError(`Login failed: ${errorMessage}`);
      }

      throw err; // Re-throw to be handled by init function
    }
  }, [session, user]);

  const refreshProfile = useCallback(async () => {
    try {
      setError(null);
      const p = await getProfile();
      setProfile(p);
    } catch (err) {
      console.error("Profile refresh failed:", err);
      setProfile(null);
      clearTokens();
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      if (errorMessage.includes("fetch") || errorMessage.includes("network") || errorMessage.includes("Failed to fetch")) {
        setError("Unable to connect to backend. Please check your connection and try again.");
      }
    }
  }, []);

  const retryConnection = useCallback(() => {
    setError(null);
    setRetryCount(0);
    initializingRef.current = false;
    // Force re-initialization
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
      // 1. Logout from backend API first
      await apiLogout();
    } catch (error) {
      console.error("Backend logout failed:", error);
    } finally {
      // 2. Clear local state
      setProfile(null);
      setError(null);
      setRetryCount(0);

      // 3. Sign out from Clerk to prevent auto re-login
      try {
        await clerk.signOut();
      } catch (error) {
        console.error("Clerk signout failed:", error);
      }
    }
  }, [clerk]);

  // On mount: if Clerk is signed in and we have stored tokens, fetch profile
  useEffect(() => {
    // Wait for Clerk to finish loading
    if (isSignedIn === undefined) return;
    // Prevent concurrent/duplicate calls
    if (initializingRef.current) return;
    // Don't retry if we've exceeded max attempts and there's an error
    if (error && retryCount >= MAX_RETRY_ATTEMPTS) return;

    initializingRef.current = true;

    async function init() {
      setIsLoading(true);
      try {
        const tokens = getTokens();
        if (tokens?.accessToken) {
          // We have tokens, try to fetch profile
          const p = await getProfile();
          setProfile(p);
          setError(null);
          setRetryCount(0);
        } else if (isSignedIn && session && !profile && retryCount < MAX_RETRY_ATTEMPTS) {
          // Only auto-login if we don't have a profile yet AND Clerk is signed in
          // This prevents the auto-login loop after logout
          await loginWithClerk();
        }
      } catch (err) {
        clearTokens();
        setProfile(null);

        // Only increment retry count if it's a connection error and we're under the limit
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          setRetryCount(prev => prev + 1);
          console.warn(`Login attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS} failed:`, err);
        } else {
          console.error("Max retry attempts reached. Stopping auto-retry.", err);
        }
      } finally {
        setIsLoading(false);
        initializingRef.current = false;
      }
    }

    init();
  }, [isSignedIn, retryCount]); // Removed profile from dependencies to prevent infinite loops
  // Intentionally omit session/loginWithClerk: they are stable once isSignedIn=true
  // and re-running on their reference changes causes repeated login calls (429s)

  return (
    <AuthContext.Provider
      value={{
        profile,
        isLoading,
        isAuthenticated: !!profile,
        isAdmin: profile?.role === "admin",
        error,
        retryCount,
        loginWithClerk,
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
