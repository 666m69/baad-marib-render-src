import { createAuthClient } from "better-auth/react";

/** Better Auth client: same-origin `/api/auth/*`, email + password, cookie sessions. */
export const authClient = createAuthClient();

/** Sign out, then go to `redirectTo`. Rejects when the server does not confirm, so the button can retry. */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  window.location.href = redirectTo;
}
