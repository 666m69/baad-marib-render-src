import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AuthScreen } from "@/components/game/AuthScreen";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg text-fg">
        <h1 className="font-display text-4xl">بعد مأرب</h1>
      </main>
    );
  }
  if (user) return <Navigate to="/" />;
  return <AuthScreen />;
}
