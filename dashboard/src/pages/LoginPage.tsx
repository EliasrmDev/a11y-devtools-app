import { SignIn } from "@clerk/clerk-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { isClerkAuth } from "@/lib/auth-mode";
import AuthErrorPage from "@/components/AuthErrorPage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { error, isLoading, loginWithEmail, signUpWithEmail, loginWithOAuth } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Show error page if there's a connection error
  if (error && !isLoading && !formError) {
    return <AuthErrorPage />;
  }

  if (isClerkAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <svg className="h-8 w-8" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" stroke="#5b8dee" strokeWidth="2" />
              <circle cx="12" cy="9.2" r="1.8" fill="#5b8dee" />
              <path d="M10.2 12.5h3.6M12 12.5v4.5" stroke="#5b8dee" strokeWidth="1.9" strokeLinecap="round" />
              <line x1="18.5" y1="18.5" x2="25" y2="25" stroke="#5b8dee" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <h1 className="text-xl font-bold text-text">
              A11y<span className="text-sub">/</span>DevTools
            </h1>
          </div>

          <SignIn
            routing="hash"
            fallbackRedirectUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "bg-surface border border-border shadow-xl",
                headerTitle: "text-text",
                headerSubtitle: "text-sub",
                formFieldLabel: "text-text",
                formFieldInput: "bg-surface-2 border-border-md text-text placeholder:text-sub",
                formButtonPrimary: "bg-primary hover:bg-primary-light text-[#06080e]",
                footerActionLink: "text-primary hover:text-primary-light",
                dividerLine: "bg-border",
                dividerText: "text-sub",
                socialButtonsBlockButton: "bg-surface-3 border-border-md text-text hover:bg-surface-3/80",
                formFieldInputShowPasswordButton: "text-sub hover:text-text",
              },
            }}
          />
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (mode === "signin") {
        await loginWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, name);
      }
      navigate("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full w-1/2">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <svg className="h-8 w-8" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" stroke="#5b8dee" strokeWidth="2" />
            <circle cx="12" cy="9.2" r="1.8" fill="#5b8dee" />
            <path d="M10.2 12.5h3.6M12 12.5v4.5" stroke="#5b8dee" strokeWidth="1.9" strokeLinecap="round" />
            <line x1="18.5" y1="18.5" x2="25" y2="25" stroke="#5b8dee" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <h1 className="text-xl font-bold text-text">
            A11y<span className="text-sub">/</span>DevTools
          </h1>
        </div>

        <Card className="border-border bg-surface w-1/2 mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-text">
              {mode === "signin" ? "Sign in" : "Create account"}
            </CardTitle>
            <CardDescription className="text-sub">
              {mode === "signin"
                ? "Enter your credentials to continue"
                : "Fill in the details to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* OAuth buttons */}
            <div className="space-y-3 mb-4">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                className="w-full border-border-md bg-surface-2 text-text hover:bg-surface-3 font-medium"
                onClick={() => { setFormError(null); setSubmitting(true); loginWithOAuth("google").catch((err) => { setFormError(err instanceof Error ? err.message : "Google sign-in failed"); setSubmitting(false); }); }}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                className="w-full border-border-md bg-surface-2 text-text hover:bg-surface-3 font-medium"
                onClick={() => { setFormError(null); setSubmitting(true); loginWithOAuth("github").catch((err) => { setFormError(err instanceof Error ? err.message : "GitHub sign-in failed"); setSubmitting(false); }); }}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                Continue with GitHub
              </Button>
            </div>

            {/* Divider */}
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-md" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-surface px-2 text-sub">or</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-text">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="bg-surface-2 border-border-md text-text placeholder:text-sub"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-text">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="bg-surface-2 border-border-md text-text placeholder:text-sub"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-text">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="bg-surface-2 border-border-md text-text placeholder:text-sub"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary hover:bg-primary-light text-[#06080e] font-medium"
              >
                {submitting
                  ? "Please wait…"
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-sub">
              {mode === "signin" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:text-primary-light font-medium"
                    onClick={() => { setMode("signup"); setFormError(null); }}
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:text-primary-light font-medium"
                    onClick={() => { setMode("signin"); setFormError(null); }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
