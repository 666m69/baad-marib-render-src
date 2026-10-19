import { useMemo } from "react";
import { authClient } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
};

/** `user` is null BOTH while loading and when signed out; check `isPending` before redirecting. */
export type CurrentUserState = { user: AppUser | null; isPending: boolean };

export function useCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  const id = data?.user.id;
  const displayName = data?.user.name ?? null;
  const primaryEmail = data?.user.email ?? null;
  const user = useMemo<AppUser | null>(
    () => (id ? { id, displayName, primaryEmail } : null),
    [id, displayName, primaryEmail],
  );
  return useMemo(() => ({ user, isPending }), [user, isPending]);
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
