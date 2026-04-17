import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useUser, useSession } from "@clerk/clerk-react";
import { login, logout as apiLogout, getProfile, getTokens, clearTokens, type Profile } from "@/lib/api";

interface AuthState {
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loginWithClerk: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, user } = useUser();
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initializingRef = useRef(false);

  const loginWithClerk = useCallback(async () => {
    if (!session) return;
    try {
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
    } catch (err) {
      console.error("Backend login failed:", err);
    }
  }, [session, user]);

  const refreshProfile = useCallback(async () => {
    try {
      const p = await getProfile();
      setProfile(p);
    } catch {
      setProfile(null);
      clearTokens();
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setProfile(null);
    }
  }, []);

  // On mount: if Clerk is signed in and we have stored tokens, fetch profile
  useEffect(() => {
    // Wait for Clerk to finish loading
    if (isSignedIn === undefined) return;
    // Prevent concurrent/duplicate calls
    if (initializingRef.current) return;

    initializingRef.current = true;

    async function init() {
      setIsLoading(true);
      try {
        const tokens = getTokens();
        if (tokens?.accessToken) {
          const p = await getProfile();
          setProfile(p);
        } else if (isSignedIn && session) {
          await loginWithClerk();
        }
      } catch {
        clearTokens();
        setProfile(null);
      } finally {
        setIsLoading(false);
        initializingRef.current = false;
      }
    }

    init();
  }, [isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Intentionally omit session/loginWithClerk: they are stable once isSignedIn=true
  // and re-running on their reference changes causes repeated login calls (429s)

  return (
    <AuthContext.Provider
      value={{
        profile,
        isLoading,
        isAuthenticated: !!profile,
        isAdmin: profile?.role === "admin",
        loginWithClerk,
        logout,
        refreshProfile,
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
