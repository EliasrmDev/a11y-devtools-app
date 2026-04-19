import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ClerkProvider } from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import { AuthProvider } from "@/lib/auth";
import { isClerkAuth } from "@/lib/auth-mode";
import App from "./App";
import "./index.css";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (isClerkAuth && !CLERK_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY env variable");
}

function AppProviders() {
  const content = (
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );

  if (isClerkAuth) {
    return (
      <ClerkProvider
        publishableKey={CLERK_KEY}
        appearance={{ baseTheme: dark }}
      >
        {content}
      </ClerkProvider>
    );
  }

  return content;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
