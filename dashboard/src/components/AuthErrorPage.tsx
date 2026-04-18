import { AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function AuthErrorPage() {
  const { error, retryConnection, retryCount } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto text-center">
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

        {/* Error Content */}
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center justify-center mb-4">
            <AlertTriangle className="h-12 w-12 text-red-600 dark:text-red-400" />
          </div>

          <h2 className="mb-2 text-lg font-semibold text-red-800 dark:text-red-200">
            Connection Error
          </h2>

          <p className="mb-4 text-sm text-red-700 dark:text-red-300">
            {error || "Unable to connect to the backend server."}
          </p>

          {retryCount > 0 && (
            <p className="mb-4 text-xs text-red-600 dark:text-red-400">
              Attempted {retryCount}/3 times
            </p>
          )}

          <div className="space-y-3">
            <Button
              onClick={retryConnection}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>

            { import.meta.env.ENVIRONMENT === "development" && (
            <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
              <p>Make sure the backend server is running:</p>
              <code className="block bg-red-100 dark:bg-red-900 px-2 py-1 rounded text-red-800 dark:text-red-200">
                cd backend && npm run dev
              </code>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}