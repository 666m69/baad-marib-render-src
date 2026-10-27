import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Droplets, Hammer, Map, ScrollText, Swords, TreePine, Mountain, Users, Coins, Wheat } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { barterGoods, claimGuide, claimOath, claimPasture, diwanGate, expandSanctuary, extendPeace, foundTribe, getWorld, hireSaalik, myLetter, readReports, releasePasture, relocate, sendAttack, sendLetter, sendScout, spoilPasture, startStudy, trainTroops, upgradeBuilding, upgradeField } from "@/lib/game/api";
import { RESOURCE_LABEL, TRAITS, capState, chebyshev, lineageBy, type Good, type OathKind } from "@/lib/game/balance";
import { coachLesson, type CoachLesson } from "@/lib/game/coach";
import { fmt, fmtRemain, tribeCount } from "@/lib/game/format";
import { POLL_GATE_MS, POLL_WORLD_MS } from "@/lib/game/polling";
import { thud, unlockAudio } from "@/lib/game/sfx";
import type { BuildingKind, StudyKind, TroopKind } from "@/lib/game/balance";
import type { GameResult, WorldSnapshot, YouState } from "@/lib/game/types";
import { AuthScreen } from "./AuthScreen";
import { CoachCard } from "./Coach";
import { MapView } from "./MapView";
import { usePoll } from "./usePoll";
import { ValleyMark } from "./Mark";
import { AboutSheet, ArmyPanel, CampPanel, FoundPanel, ReportsPanel, TileSheet } from "./Panels";
import { Btn } from "./ui";

type Tab = "map" | "camp" | "army" | "reports";

const ICONS = {
  water: Droplets,
  food: Wheat,
  gold: Coins,
  wood: TreePine,
  stone: Mountain,
  people: Users,
} as const;

export function GameApp() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
        <div>
          <p className="text-sm text-accent">وادي واحد</p>
          <h1 className="mt-2 font-display text-5xl">بعد مأرب</h1>
          <p className="mt-3 text-pretty text-muted">القبائل بعد انهيار السد. يُفتح الوادي…</p>
        </div>
      </main>
    );
  }
  if (!user) return <AuthScreen />;
  return <Authed userId={user.id} />;
}

function Authed({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const worldPoll = usePoll(POLL_WORLD_MS);
  const gatePoll = usePoll(POLL_GATE_MS);
  const query = useQuery({
    queryKey: ["world", userId],
    queryFn: () => getWorld(),
    refetchInterval: worldPoll,
    refetchIntervalInBackground: false,
  });
  const [tab, setTab] = useState<Tab>("map");
  const [campFocus, setCampFocus] = useState<{ kind: BuildingKind; at: number } | null>(null);
  useEffect(() => {
    if (tab !== "camp") setCampFocus(null);
  }, [tab]);
  const raise = (kind: BuildingKind) => {
    setCampFocus({ kind, at: Date.now() });
    setTab("camp");
  };
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [about, setAbout] = useState(false);
  const [coachOn, setCoachOn] = useState(true);
  const [coachAck, setCoachAck] = useState<string[]>([]);
  const [coachBoot, setCoachBoot] = useState(0);
  const [letterOn, setLetterOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const gate = useQuery({
    queryKey: ["diwan-gate", userId],
    queryFn: () => diwanGate(),
    refetchInterval: gatePoll,
    refetchIntervalInBackground: false,
  });
  const desk = gate.data;
  const skew = useRef(0);
  const serverNow = query.data?.serverNow;

  useEffect(() => {
    const hideKey = `marib-coach-hide:${userId}`;
    const ackKey = `marib-coach-ack:${userId}`;
    setCoachOn(localStorage.getItem(hideKey) !== "1");
    try {
      const raw = JSON.parse(localStorage.getItem(ackKey) || "[]");
      if (Array.isArray(raw)) setCoachAck(raw.filter((item) => typeof item === "string"));
      else setCoachAck([]);
    } catch {
      setCoachAck([]);
    }
  }, [userId]);

  function hideCoach() {
    setCoachOn(false);
    localStorage.setItem(`marib-coach-hide:${userId}`, "1");
  }

  function showCoach() {
    setCoachOn(true);
    setCoachBoot((value) => value + 1);
    localStorage.setItem(`marib-coach-hide:${userId}`, "0");
  }

  function ackCoach(id: string) {
    setCoachAck((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      localStorage.setItem(`marib-coach-ack:${userId}`, JSON.stringify(next));
      return next;
    });
  }

  function followCoach(lesson: CoachLesson) {
    const world = query.data;
    const you = world?.you;
    if (lesson.go) setTab(lesson.go);
    if (!world || !you || !lesson.focus) return;
    if (lesson.focus === "home") {
      setSelected({ x: you.x, y: you.y });
      setTab("map");
      return;
    }
    const spots = lesson.focus === "bandit" ? world.bandits : world.saalik;
    const spot = [...spots].sort(
      (a, b) => chebyshev(a.x, a.y, you.x, you.y) - chebyshev(b.x, b.y, you.x, you.y),
    )[0];
    if (!spot) return;
    setSelected({ x: spot.x, y: spot.y });
    setTab("map");
  }

  useEffect(() => {
    if (!serverNow) return;
    skew.current = serverNow - Date.now();
    setNow(Date.now() + skew.current);
  }, [serverNow]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + skew.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (tab !== "reports" || !query.data?.unread) return;
    void readReports({ data: null }).then((res) => {
      if (res.ok) queryClient.setQueryData(["world", userId], res.world);
    });
  }, [tab, query.data?.unread, queryClient, userId]);

  const seenClash = useRef(0);
  useEffect(() => {
    const world = query.data;
    const latest = world?.clashes[0];
    if (!world?.you || !latest || latest.id === seenClash.current) return;
    seenClash.current = latest.id;
    if (now - latest.createdAt < 15000) setSelected(null);
  }, [query.data, now]);

  async function run(fn: () => Promise<GameResult>, sound?: "build" | "march" | "good" | "bad") {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setFlash(res.error);
        thud("bad");
        return;
      }
      queryClient.setQueryData(["world", userId], res.world);
      if (sound) thud(sound);
    } catch {
      setFlash("تعذّر الاتصال بالوادي.");
      thud("bad");
    } finally {
      setBusy(false);
    }
  }

  if (query.isPending) return <Shell title="بعد مأرب" note="تُرسَم الرمال…" />;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "";
    if (message === "Unauthorized") return <AuthScreen />;
    return (
      <Shell title="بعد مأرب" note="تعذّر فتح الوادي.">
        <button type="button" className="min-h-11 text-accent" onClick={() => void query.refetch()}>
          أعد المحاولة
        </button>
      </Shell>
    );
  }

  const world = query.data;
  if (!world.you) {
    return (
      <div className="min-h-dvh bg-bg" onPointerDown={unlockAudio}>
        <Top
          you={null}
          world={world}
          onAbout={() => setAbout(true)}
          onCoach={coachOn ? null : showCoach}
          onLetter={() => setLetterOn(true)}
          desk={desk}
        />
        {coachOn && (
          <CoachCard world={world} acked={coachAck} boot={coachBoot} onHide={hideCoach} onAck={ackCoach} onGo={followCoach} onClaim={(id) => void run(() => claimGuide({ data: id }), "good")} />
        )}
        {flash && <p className="px-4 text-sm text-danger">{flash}</p>}
        <FoundPanel
          busy={busy}
          onFound={(input) => void run(() => foundTribe({ data: input }), "good")}
        />
        {about && <AboutSheet onClose={() => setAbout(false)} />}
        {letterOn && <LetterSheet onClose={() => setLetterOn(false)} />}
      </div>
    );
  }

  const you = world.you;
  const guide = coachOn ? coachLesson(world, coachAck) : null;
  const glow = guide && guide.id !== "ready" ? guide.go : null;
  const actions = {
    busy,
    upgrade: (kind: BuildingKind) => void run(() => upgradeBuilding({ data: kind }), "build"),
    upgradeField: (slot: number) => void run(() => upgradeField({ data: slot }), "build"),
    study: (kind: StudyKind) => void run(() => startStudy({ data: kind }), "build"),
    expand: () => void run(() => expandSanctuary({ data: null }), "build"),
    peace: () => void run(() => extendPeace({ data: null }), "good"),
    train: (kind: TroopKind, qty: number) => void run(() => trainTroops({ data: { kind, qty } }), "build"),
    move: (x: number, y: number) => void run(() => relocate({ data: { x, y } }), "march"),
    claimPasture: (x: number, y: number) => void run(() => claimPasture({ data: { x, y } }), "build"),
    releasePasture: (x: number, y: number) => void run(() => releasePasture({ data: { x, y } }), "build"),
    spoil: (x: number, y: number, infantry: number, cavalry: number) =>
      void run(() => spoilPasture({ data: { x, y, infantry, cavalry } }), "march"),
    attack: (targetKind: "player" | "bandit" | "saalik", targetId: string, infantry: number, cavalry: number) =>
      void run(() => sendAttack({ data: { targetKind, targetId, infantry, cavalry } }), "march"),
    scout: (targetKind: "player" | "bandit", targetId: string) =>
      void run(() => sendScout({ data: { targetKind, targetId } }), "march"),
    hire: (id: number) => void run(() => hireSaalik({ data: id }), "good"),
    claim: (kind: OathKind) => void run(() => claimOath({ data: kind }), "good"),
    barter: (give: Good, take: Good, lots: number) => void run(() => barterGoods({ data: { give, take, lots } }), "good"),
  };
  return (
    <div className="flex h-dvh flex-col bg-bg text-fg" onPointerDown={unlockAudio}>
      <Top
        you={you}
        world={world}
        now={now}
        onAbout={() => setAbout(true)}
        onCoach={coachOn ? null : showCoach}
        onLetter={() => setLetterOn(true)}
        onRaise={raise}
        desk={desk}
      />
      {coachOn && (
        <CoachCard world={world} acked={coachAck} boot={coachBoot} onHide={hideCoach} onAck={ackCoach} onGo={followCoach} onClaim={(id) => void run(() => claimGuide({ data: id }), "good")} />
      )}
      {flash && <p className="border-b border-line px-4 py-2 text-sm text-danger">{flash}</p>}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={tab === "map" ? "relative min-h-0 flex-1" : "relative hidden min-h-0 flex-1 lg:block"}>
          <MapView world={world} now={now} selected={selected} onSelect={(x, y) => { setSelected({ x, y }); setTab("map"); }} />
          {selected && tab === "map" && (
            <div className="absolute inset-x-0 bottom-0 z-10 max-h-[46%] overflow-auto rounded-t-2xl border-t border-line bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)] lg:hidden">
              <div className="sticky top-0 z-10 flex items-center justify-center bg-surface px-3 pt-2 pb-1">
                <span className="h-1 w-10 rounded-full bg-line" />
                <button type="button" onClick={() => setSelected(null)} className="absolute end-1 min-h-11 px-3 text-sm text-muted">
                  إغلاق
                </button>
              </div>
              <TileSheet world={world} x={selected.x} y={selected.y} now={now} actions={actions} />
            </div>
          )}
        </div>
        <aside className={`${tab === "map" ? "hidden lg:flex" : "flex"} min-h-0 w-full flex-1 flex-col border-line bg-bg lg:w-[380px] lg:flex-none lg:border-s`}>
          <div className="hidden gap-1 border-b border-line p-2 lg:flex">
            <SideTab active={tab === "map"} glow={glow === "map"} onClick={() => setTab("map")}>الموضع</SideTab>
            <SideTab active={tab === "camp"} glow={glow === "camp"} onClick={() => setTab("camp")}>التطوير</SideTab>
            <SideTab active={tab === "army"} glow={glow === "army"} onClick={() => setTab("army")}>الجيش</SideTab>
            <SideTab active={tab === "reports"} glow={glow === "reports"} onClick={() => setTab("reports")}>
              التقارير{world.unread ? ` ${world.unread}` : ""}
            </SideTab>
          </div>
          <div className="min-h-0 flex-1 overflow-auto pb-2">
            {tab === "map" && (
              selected ? (
                <TileSheet world={world} x={selected.x} y={selected.y} now={now} actions={actions} />
              ) : (
                <p className="p-4 text-sm text-muted">اختر موضعاً على الخريطة: مضارب، معسكر، أو رمل تنقل إليه.</p>
              )
            )}
            {tab === "camp" && <CampPanel you={you} now={now} actions={actions} focus={campFocus} />}
            {tab === "army" && <ArmyPanel you={you} now={now} actions={actions} />}
            {tab === "reports" && <ReportsPanel world={world} />}
          </div>
        </aside>
      </div>
      <nav className="grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <NavButton active={tab === "map"} glow={glow === "map"} onClick={() => setTab("map")} icon={<Map size={18} />} label="الخريطة" />
        <NavButton active={tab === "camp"} glow={glow === "camp"} onClick={() => setTab("camp")} icon={<Hammer size={18} />} label="التطوير" />
        <NavButton active={tab === "army"} glow={glow === "army"} onClick={() => setTab("army")} icon={<Swords size={18} />} label="الجيش" />
        <NavButton
          active={tab === "reports"}
          glow={glow === "reports"}
          onClick={() => setTab("reports")}
          icon={<ScrollText size={18} />}
          label="التقارير"
          badge={world.unread}
        />
      </nav>
      {about && <AboutSheet onClose={() => setAbout(false)} />}
      {letterOn && <LetterSheet onClose={() => setLetterOn(false)} />}
    </div>
  );
}

function Top({
  you,
  world,
  now,
  onAbout,
  onCoach,
  onLetter,
  onRaise,
  desk,
}: {
  you: YouState | null;
  world: WorldSnapshot;
  now?: number;
  onAbout: () => void;
  onCoach: (() => void) | null;
  onLetter: () => void;
  onRaise?: (kind: BuildingKind) => void;
  desk?: { steward: boolean; pending: number };
}) {
  const peace = you?.peaceUntil && now ? you.peaceUntil - now : 0;
  return (
    <header className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5" data-testid="game-header">
        <button type="button" onClick={onAbout} className="flex min-w-0 flex-1 basis-40 items-center gap-2 text-start">
          <ValleyMark size={28} />
          <span className="min-w-0">
            <span className="block truncate font-display text-xl leading-none">{you?.name ?? "بعد مأرب"}</span>
            <span className="block truncate text-[11px] text-faint">
              {you ? `الشيخ ${you.sheikh} · ${lineageBy(you.lineage)?.name ?? TRAITS[you.trait].label}` : "قبل النصب"}
              {" · "}
              {tribeCount(world.playerCount)}
            </span>
          </span>
        </button>
        {world.clock && (
          <span className="order-last shrink-0 rounded-full bg-surface-2 px-2 py-1 text-[11px] text-faint sm:order-none">
            {world.clock.night ? "ليل" : "نهار"}
            {now ? ` ${fmtRemain(Math.max(0, world.clock.until - now))}` : ""}
          </span>
        )}
        {peace > 0 && (
          <span className="order-last shrink-0 rounded-full bg-accent/15 px-2 py-1 text-[11px] text-accent sm:order-none">درع {fmtRemain(peace)}</span>
        )}
        <span className="hidden sm:ms-auto sm:block" />
        <div className="flex shrink-0 items-center">
          {onCoach && (
            <button type="button" onClick={onCoach} className="relative inline-flex min-h-11 items-center px-2 text-xs text-accent">
              <span className="absolute top-2 start-1 size-1.5 rounded-full bg-accent task-dot" />
              المرشد
            </button>
          )}
          {desk?.steward && (
            <Link to="/diwan" className="relative inline-flex min-h-11 items-center px-2 text-xs text-accent">
              الديوان
              {desk.pending > 0 ? ` ${desk.pending}` : ""}
            </Link>
          )}
          <button type="button" onClick={onLetter} className="inline-flex min-h-11 items-center px-2 text-xs text-muted">
            رسالة
          </button>
          <UserButton />
        </div>
      </div>
      {you && (
        <>
          <div className="grid grid-cols-6 gap-px px-1 sm:px-2" data-testid="resource-bar">
            <Chip icon={ICONS.water} label={RESOURCE_LABEL.water} value={you.water} rate={you.rates.water} cap={you.storageCap} raise="storehouse" onRaise={onRaise} />
            <Chip icon={ICONS.food} label={RESOURCE_LABEL.food} value={you.food} rate={you.rates.food} cap={you.storageCap} raise="storehouse" onRaise={onRaise} />
            <Chip icon={ICONS.gold} label={RESOURCE_LABEL.gold} value={you.gold} rate={you.rates.gold} cap={you.goldCap} raise="tent" onRaise={onRaise} />
            <Chip icon={ICONS.wood} label={RESOURCE_LABEL.wood} value={you.wood} rate={you.rates.wood} cap={you.storageCap} raise="storehouse" onRaise={onRaise} />
            <Chip icon={ICONS.stone} label={RESOURCE_LABEL.stone} value={you.stone} rate={you.rates.stone} cap={you.storageCap} raise="storehouse" onRaise={onRaise} />
            <Chip icon={ICONS.people} label={RESOURCE_LABEL.people} value={you.people} cap={you.peopleCap} />
          </div>
          <p className="px-3 pb-2 text-center text-[10px] text-faint">
            سعة المخزن {fmt(you.storageCap)} لكل من الماء والطعام والخشب والحجر · بيت المال {fmt(you.goldCap)} ذهب
          </p>
        </>
      )}
    </header>
  );
}

function Chip({
  icon: Icon,
  label,
  value,
  rate,
  cap,
  raise,
  onRaise,
}: {
  icon: typeof Droplets;
  label: string;
  value: number;
  rate?: number;
  cap?: number;
  raise?: BuildingKind;
  onRaise?: (kind: BuildingKind) => void;
}) {
  const state = cap != null ? capState(value, cap) : "ok";
  const raiseLabel = raise === "tent" ? "ارفع الخيمة" : "ارفع المخزن";
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 overflow-hidden py-1 text-center" aria-label={label} data-cap-state={state}>
      <Icon size={14} aria-hidden="true" className="text-muted" />
      {/* Value and cap on separate lines below `sm`, so «3,000/3,000» never runs into the next chip at 390px. */}
      <p dir="ltr" className={`flex max-w-full flex-col items-center whitespace-nowrap tabular-nums text-[13px] leading-none sm:flex-row ${state === "warn" ? "text-accent" : state === "full" ? "text-danger" : ""}`}>
        <span>{fmt(value)}</span>
        {cap != null ? <span className="text-[10px] text-faint">/{fmt(cap)}</span> : null}
      </p>
      {state === "full" && raise && onRaise ? (
        <button type="button" onClick={() => onRaise(raise)} className="min-h-6 whitespace-nowrap px-0.5 text-[11px] leading-none text-danger underline">
          {raiseLabel}
        </button>
      ) : (
        <p className={`h-3 text-[10px] leading-none ${state === "warn" ? "text-accent" : "text-oasis"}`}>
          {state === "warn" && raise ? "يقارب الامتلاء" : rate ? `+${fmt(rate)}` : ""}
        </p>
      )}
    </div>
  );
}

function NavButton({
  active,
  glow = false,
  onClick,
  icon,
  label,
  badge = 0,
}: {
  active: boolean;
  glow?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button type="button" onClick={onClick} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 text-xs ${active ? "border-accent text-accent" : "border-transparent text-muted"}`}>
      {glow && <span className="absolute top-1.5 size-1.5 rounded-full bg-accent task-dot" />}
      {icon}
      {label}
      {badge > 0 && (
        <span className="absolute top-2 end-6 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-xs text-danger-fg">
          {badge}
        </span>
      )}
    </button>
  );
}

function SideTab({
  active,
  glow = false,
  onClick,
  children,
}: {
  active: boolean;
  glow?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-11 flex-1 rounded-md text-sm ${active ? "bg-surface-2 text-fg" : "text-muted"}`}
    >
      {glow && <span className="absolute top-1.5 start-1.5 size-1.5 rounded-full bg-accent task-dot" />}
      {children}
    </button>
  );
}

function LetterSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["letter"], queryFn: () => myLetter() });
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const letter = query.data;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-label="رسالة إلى الديوان">
      <form
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void sendLetter({ data: body }).then(async (res) => {
            setBusy(false);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setBody("");
            await queryClient.invalidateQueries({ queryKey: ["letter"] });
            await queryClient.invalidateQueries({ queryKey: ["diwan-gate"] });
          });
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-accent">الديوان</p>
            <h2 className="font-display text-2xl leading-none">رسالة إلى الإدارة</h2>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm text-muted">
            إغلاق
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">رسالة واحدة حتى يصل الرد، ويظهر في تقاريرك.</p>
        {query.isPending && <p className="mt-4 text-sm text-faint">تُراجع رسائلك…</p>}
        {letter?.open && (
          <div className="mt-4 rounded-xl border border-s-2 border-line border-s-accent bg-bg p-3">
            <p className="text-[11px] text-accent">بانتظار الرد</p>
            <p className="mt-1 text-sm text-pretty">{letter.body}</p>
          </div>
        )}
        {letter && !letter.open && letter.reply && (
          <div className="mt-4 rounded-xl border border-line bg-bg p-3">
            <p className="text-[11px] text-faint">آخر رد</p>
            <p className="mt-1 text-sm text-pretty text-muted">{letter.reply}</p>
          </div>
        )}
        {!query.isPending && !letter?.open && (
          <>
            <textarea
              value={body}
              maxLength={280}
              onChange={(event) => setBody(event.target.value)}
              className="mt-4 min-h-28 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
              placeholder="اكتب باختصار"
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-[11px] text-danger">{error}</p>
              <p className="text-[11px] text-faint">{body.trim().length}/280</p>
            </div>
            <Btn disabled={busy || body.trim().length < 2} type="submit" className="mt-3 w-full">
              {busy ? "تُرسل…" : "أرسل إلى الديوان"}
            </Btn>
          </>
        )}
      </form>
    </div>
  );
}

function Shell({ title, note, children }: { title: string; note: string; children?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div>
        <h1 className="font-display text-5xl">{title}</h1>
        <p className="mt-3 text-muted">{note}</p>
        {children}
      </div>
    </main>
  );
}
