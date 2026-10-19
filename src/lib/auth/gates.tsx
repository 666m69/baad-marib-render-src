import { useState, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { signOut } from "./client";
import { resolveSignInGateState } from "./sign-in-gate";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

export const SIGN_IN_PATH = "/login";

export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

export function SignInGate({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const state = resolveSignInGateState({ isPending, hasUser: user !== null });
  if (state === "pending") return null;
  if (state === "signed_in") return <>{children}</>;
  return <>{fallback ?? <RedirectToSignIn />}</>;
}

/** Sign-out control; cannot be fired twice and recovers if the server refuses. */
export function UserButton() {
  const user = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          void signOut().catch(() => setSigningOut(false));
        }}
        className="min-h-11 cursor-pointer px-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline disabled:cursor-wait"
      >
        {signingOut ? "يخرج…" : "خروج"}
      </button>
    </div>
  );
}
