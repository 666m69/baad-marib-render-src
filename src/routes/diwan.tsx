import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { loadDiwan, replyLetter } from "@/lib/game/api";
import { LINEAGE, type Lineage } from "@/lib/game/balance";
import { fmt } from "@/lib/game/format";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AuthScreen } from "@/components/game/AuthScreen";
import { Btn } from "@/components/game/ui";

export const Route = createFileRoute("/diwan")({ component: DiwanPage });

function DiwanPage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <main className="grid min-h-dvh place-items-center bg-bg text-fg">الديوان يُفتح…</main>;
  if (!user) return <AuthScreen />;
  return <Board />;
}

function Board() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["diwan"], queryFn: () => loadDiwan() });
  if (query.isPending) return <main className="grid min-h-dvh place-items-center bg-bg text-fg">تُجمع أخبار الوادي…</main>;
  if (query.isError || !query.data) {
    return <main className="grid min-h-dvh place-items-center bg-bg text-fg">تعذّر فتح الديوان.</main>;
  }
  const board = query.data;
  if (!board.ok) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
          <p className="text-[11px] text-accent">بعد مأرب</p>
          <h1 className="mt-1 font-display text-4xl">الديوان</h1>
          <p className="mt-3 text-sm text-muted">ليس هذا ديوانك. رسائلك تُرسل من الوادي.</p>
          <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-sm text-accent">
            عودة إلى الوادي
          </Link>
        </div>
      </main>
    );
  }

  const waiting = board.letters.filter((letter) => !letter.reply);
  const answered = board.letters.filter((letter) => letter.reply);
  const horse = board.tribes.reduce((sum, tribe) => sum + tribe.cavalry, 0);

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-end justify-between px-4 py-3">
          <div>
            <p className="text-[11px] text-accent">مراقبة بلا تعديل</p>
            <h1 className="font-display text-3xl leading-none">الديوان</h1>
          </div>
          <Link to="/" className="min-h-11 text-sm text-accent">
            الوادي
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4">
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="قبائل" value={fmt(board.tribes.length)} />
          <Stat label="بانتظار الرد" value={fmt(waiting.length)} hot={waiting.length > 0} />
          <Stat label="فرسان الوادي" value={fmt(horse)} />
        </dl>

        <section>
          <h2 className="text-sm text-faint">الرسائل</h2>
          {board.letters.length === 0 && <p className="mt-3 text-sm text-muted">لا رسائل بعد.</p>}
          <ul className="mt-3 flex flex-col gap-3">
            {waiting.map((letter) => (
              <li key={letter.id} className="rounded-2xl border border-line border-s-2 border-s-accent bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{letter.tribe}</p>
                  <p className="text-[11px] text-accent">{since(letter.createdAt)}</p>
                </div>
                <p className="mt-2 text-sm text-pretty leading-relaxed">{letter.body}</p>
                <ReplyForm
                  onSend={async (body) => {
                    const res = await replyLetter({ data: { id: letter.id, body } });
                    if (!res.ok) return res.error;
                    await query.refetch();
                    await queryClient.invalidateQueries({ queryKey: ["diwan-gate"] });
                    return null;
                  }}
                />
              </li>
            ))}
            {answered.map((letter) => (
              <li key={letter.id} className="rounded-2xl border border-line bg-surface/70 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-muted">{letter.tribe}</p>
                  <p className="text-[11px] text-faint">رُدّ عليها</p>
                </div>
                <p className="mt-2 text-sm text-pretty text-muted">{letter.body}</p>
                <p className="mt-2 text-sm text-pretty">{letter.reply}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-sm text-faint">القبائل</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {board.tribes.map((tribe) => {
              const people = LINEAGE[tribe.lineage as Lineage];
              return (
                <li key={`${tribe.name}-${tribe.x}-${tribe.y}`} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{tribe.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {people?.name ?? "خصلة قديمة"} · الشيخ {tribe.sheikh} · {tribe.x}، {tribe.y}
                      </p>
                    </div>
                    <p className="text-[11px] text-faint">
                      صيت {fmt(tribe.renown)}
                      {tribe.peace ? " · درع" : ""}
                      {tribe.pacts > 0 ? " · صعلوك" : ""}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center sm:grid-cols-7">
                    <Meter k="ماء" v={tribe.water} />
                    <Meter k="طعام" v={tribe.food} />
                    <Meter k="ذهب" v={tribe.gold} />
                    <Meter k="خشب" v={tribe.wood} />
                    <Meter k="حجر" v={tribe.stone} />
                    <Meter k="مشاة" v={tribe.infantry} />
                    <Meter k="فرسان" v={tribe.cavalry} />
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2">
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd className={`mt-1 font-display text-2xl leading-none ${hot ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}

function Meter({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded-md bg-bg px-1 py-1.5">
      <dt className="text-[10px] text-faint">{k}</dt>
      <dd className="text-xs tabular-nums">{fmt(v)}</dd>
    </div>
  );
}

function since(at: number) {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} د`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `قبل ${hours} س`;
  return `قبل ${Math.round(hours / 24)} ي`;
}

function ReplyForm({ onSend }: { onSend: (body: string) => Promise<string | null> }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        void onSend(body).then((message) => {
          setBusy(false);
          if (message) setError(message);
          else setBody("");
        });
      }}
    >
      <textarea
        value={body}
        maxLength={400}
        onChange={(event) => setBody(event.target.value)}
        className="min-h-24 rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        placeholder="رد مختصر يصلهم في التقارير"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-danger">{error}</p>
        <p className="text-[11px] text-faint">{body.trim().length}/400</p>
      </div>
      <Btn disabled={busy || body.trim().length < 2} type="submit">
        {busy ? "يُرسل…" : "أرسل الرد"}
      </Btn>
    </form>
  );
}
