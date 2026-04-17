import { SignIn } from "@clerk/clerk-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
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
              formFieldInput:
                "bg-surface-2 border-border-md text-text placeholder:text-sub",
              formButtonPrimary: "bg-primary hover:bg-primary-light text-[#06080e]",
              footerActionLink: "text-primary hover:text-primary-light",
              dividerLine: "bg-border",
              dividerText: "text-sub",
              socialButtonsBlockButton:
                "bg-surface-3 border-border-md text-text hover:bg-surface-3/80",
              formFieldInputShowPasswordButton: "text-sub hover:text-text",
            },
          }}
        />
      </div>
    </div>
  );
}
