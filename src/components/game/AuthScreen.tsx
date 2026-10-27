import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { Btn, Field, inputClass } from "./ui";
import { ValleyMark } from "./Mark";
import { arabicAuthError } from "@/lib/game/auth-errors";

export function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || "شيخ",
          callbackURL: "/",
        });
        if (err) {
          setError(arabicAuthError(err));
          return;
        }
      } else {
        const { error: err } = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: "/",
        });
        if (err) {
          setError(arabicAuthError(err));
          return;
        }
      }
      await authClient.getSession();
      await navigate({ to: "/" });
    } catch {
      setError("تعذّر الدخول. حاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-y-auto bg-bg px-5 py-10 text-fg">
      <div className="mx-auto grid w-full max-w-md gap-8">
        <header>
          <div className="flex items-center gap-3">
            <ValleyMark size={48} />
            <div>
              <p className="text-sm text-accent">وادي واحد</p>
              <h1 className="font-display text-5xl leading-tight">بعد مأرب</h1>
            </div>
          </div>
          <p className="mt-3 text-pretty text-muted">
            القبائل بعد انهيار السد. اختر شيخاً وراية، وابنِ مضاربك، وبايع
            الصعاليك أو واجههم على الخريطة.
          </p>
        </header>
        <form
          onSubmit={submit}
          className="grid gap-4 rounded-xl bg-surface p-5"
        >
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-bg p-1">
            <button
              type="button"
              onClick={() => setMode("up")}
              className={`min-h-11 rounded-md text-sm ${mode === "up" ? "bg-surface-2 text-fg" : "text-muted"}`}
            >
              تسجيل
            </button>
            <button
              type="button"
              onClick={() => setMode("in")}
              className={`min-h-11 rounded-md text-sm ${mode === "in" ? "bg-surface-2 text-fg" : "text-muted"}`}
            >
              دخول
            </button>
          </div>
          {mode === "up" && (
            <Field label="الاسم">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </Field>
          )}
          <Field label="البريد">
            <input
              className={inputClass}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              dir="ltr"
            />
          </Field>
          <Field label="كلمة السر">
            <input
              className={inputClass}
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              dir="ltr"
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Btn type="submit" disabled={pending}>
            {pending
              ? "لحظة…"
              : mode === "up"
                ? "أنشئ حساباً وادخل"
                : "ادخل الوادي"}
          </Btn>
        </form>
      </div>
    </main>
  );
}
