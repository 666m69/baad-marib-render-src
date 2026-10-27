import { useEffect, useState } from "react";
import {
  BUILDINGS,
  FIELD_LABEL,
  FIELD_MAX,
  FIELD_SLOTS,
  RESOURCE_LABEL,
  fieldCost,
  fieldRate,
  upgradeCost,
  type BuildingKind,
  type FieldGood,
} from "@/lib/game/balance";
import { upgradeYield } from "@/lib/game/develop";
import { costParts, fmt, fmtRemain, shortage } from "@/lib/game/format";
import type { YouState } from "@/lib/game/types";
import { Btn } from "./ui";

const YARD: { kind: BuildingKind; x: number; y: number }[] = [
  { kind: "well", x: 30, y: 30 },
  { kind: "farm", x: 72, y: 28 },
  { kind: "workshop", x: 27, y: 70 },
  { kind: "barracks", x: 74, y: 68 },
  { kind: "storehouse", x: 50, y: 84 },
];

const TONE: Record<FieldGood, string> = {
  food: "bg-oasis text-oasis-fg",
  water: "border border-oasis bg-pool text-fg",
  wood: "border border-accent/80 bg-dune text-fg",
  stone: "border border-danger/80 bg-sand text-fg",
};

export function CampMap({
  you,
  now,
  actions,
  focus = null,
}: {
  you: YouState;
  now: number;
  actions: { busy: boolean; upgrade: (kind: BuildingKind) => void; upgradeField: (slot: number) => void };
  /** Open the yard on this building (e.g. «ارفع المخزن» from a full resource bar). */
  focus?: { kind: BuildingKind; at: number } | null;
}) {
  const fields = you.fields ?? [];
  const [view, setView] = useState<"fields" | "yard">(focus ? "yard" : "fields");
  const [slot, setSlot] = useState(9);
  const [kind, setKind] = useState<BuildingKind>(focus?.kind ?? "tent");
  useEffect(() => {
    if (!focus) return;
    setView("yard");
    setKind(focus.kind);
  }, [focus]);
  const activeField = fields.find((field) => field.upgradeUntil != null);
  const activeBuilding = you.buildings.find((building) => building.upgradeUntil != null);
  const activeLeft = activeField?.upgradeUntil
    ? activeField.upgradeUntil - now
    : activeBuilding?.upgradeUntil
      ? activeBuilding.upgradeUntil - now
      : 0;
  const activeName = activeField
    ? FIELD_LABEL[activeField.good]
    : activeBuilding
      ? BUILDINGS[activeBuilding.kind].label
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-1 rounded-lg bg-surface-2 p-2 text-center">
        {(["water", "food", "wood", "stone", "gold"] as const).map((good) => (
          <div key={good}>
            <p className="text-xs text-faint">{RESOURCE_LABEL[good]}</p>
            <p className="tabular-nums text-sm text-fg">{fmt(you.rates[good] * 60)}</p>
            <p className="text-xs text-faint">/ ساعة</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => setView("fields")}
          className={`min-h-11 rounded-md text-sm ${view === "fields" ? "bg-accent text-accent-fg" : "text-muted"}`}
        >
          الحقول
        </button>
        <button
          type="button"
          onClick={() => setView("yard")}
          className={`min-h-11 rounded-md text-sm ${view === "yard" ? "bg-accent text-accent-fg" : "text-muted"}`}
        >
          المضارب
        </button>
      </div>

      {activeName && (
        <p className="rounded-md border border-accent/40 bg-surface px-3 py-2 text-sm text-accent">
          طابور البناء: {activeName} · {activeLeft > 0 ? fmtRemain(activeLeft) : "يكتمل…"}
        </p>
      )}

      <div className="relative mx-auto aspect-square w-[min(100%,46dvh)] overflow-hidden rounded-xl border border-line" aria-label={view === "fields" ? "حقول القبيلة" : "مضارب القبيلة"}>
        <Ground view={view} />
        {view === "fields" ? (
          <>
            <button
              type="button"
              onClick={() => setView("yard")}
              className="absolute z-20 flex size-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 border-danger/70 bg-dune"
              style={{ left: "50%", top: "50%" }}
              aria-label="ادخل المضارب"
            >
              <TentMark />
              <span className="text-xs text-fg">المضارب</span>
            </button>
            {FIELD_SLOTS.map((spec) => {
              const row = fields.find((field) => field.slot === spec.slot);
              const level = row?.level ?? spec.start;
              const busy = row?.upgradeUntil != null;
              const on = slot === spec.slot;
              return (
                <button
                  key={spec.slot}
                  type="button"
                  onClick={() => setSlot(spec.slot)}
                  aria-pressed={on}
                  aria-label={`${FIELD_LABEL[spec.good]} مستوى ${fmt(level)}`}
                  className={`absolute z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[42%_58%_48%_52%] ${
                    spec.slot < 12 ? "size-12" : "size-11"
                  } ${TONE[spec.good]} ${on ? "outline outline-2 outline-offset-2 outline-accent" : ""} ${busy ? "outline-dashed" : ""}`}
                  style={{ left: `${spec.x}%`, top: `${spec.y}%` }}
                >
                  <FieldMark good={spec.good} />
                  <span className="absolute -top-2 left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-fg text-xs font-medium text-bg tabular-nums">
                    {fmt(level)}
                  </span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setKind("tent");
              }}
              aria-pressed={kind === "tent"}
              aria-label={`خيمة الشيخ مستوى ${fmt(levelOf(you, "tent"))}`}
              className={`absolute z-10 flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center ${kind === "tent" ? "outline outline-2 outline-offset-4 outline-accent rounded-md" : ""}`}
              style={{ left: "50%", top: "46%" }}
            >
              <TentMark large />
              <Level level={levelOf(you, "tent")} />
              <span className="text-xs text-fg">الخيمة</span>
            </button>
            {YARD.map((spot) => (
              <button
                key={spot.kind}
                type="button"
                onClick={() => setKind(spot.kind)}
                aria-pressed={kind === spot.kind}
                aria-label={`${BUILDINGS[spot.kind].label} مستوى ${fmt(levelOf(you, spot.kind))}`}
                className={`absolute z-10 flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center ${kind === spot.kind ? "outline outline-2 outline-offset-2 outline-accent rounded-md" : ""}`}
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              >
                <YardMark kind={spot.kind} built={levelOf(you, spot.kind) > 0} />
                <Level level={levelOf(you, spot.kind)} />
                <span className="max-w-16 truncate text-xs text-fg">{BUILDINGS[spot.kind].label}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {view === "fields" ? (
        <FieldCard you={you} now={now} slot={slot} busy={actions.busy} queued={Boolean(activeName)} onUpgrade={actions.upgradeField} />
      ) : (
        <BuildingCard you={you} now={now} kind={kind} busy={actions.busy} queued={Boolean(activeName) && activeBuilding?.kind !== kind} onUpgrade={actions.upgrade} />
      )}
    </div>
  );
}

function levelOf(you: YouState, kind: BuildingKind) {
  return you.buildings.find((building) => building.kind === kind)?.level ?? 0;
}

function Level({ level }: { level: number }) {
  return (
    <span className="grid size-6 place-items-center rounded-full bg-fg text-xs font-medium text-bg tabular-nums">{fmt(level)}</span>
  );
}

function FieldCard({
  you,
  now,
  slot,
  busy,
  queued,
  onUpgrade,
}: {
  you: YouState;
  now: number;
  slot: number;
  busy: boolean;
  queued: boolean;
  onUpgrade: (slot: number) => void;
}) {
  const spec = FIELD_SLOTS.find((item) => item.slot === slot) ?? FIELD_SLOTS[0];
  const row = (you.fields ?? []).find((field) => field.slot === spec.slot);
  const level = row?.level ?? 0;
  const left = row?.upgradeUntil ? row.upgradeUntil - now : 0;
  const maxed = level >= FIELD_MAX;
  const next = maxed ? null : fieldCost(spec.good, level + 1);
  const lack = next ? shortage(you, next) : null;
  const mine = row?.upgradeUntil != null;
  return (
    <article className="rounded-xl border border-accent/40 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{FIELD_LABEL[spec.good]}</h3>
          <p className="text-sm text-faint">مستوى {fmt(level)} من {fmt(FIELD_MAX)}</p>
        </div>
        {mine ? (
          <span className="tabular-nums text-sm text-accent">{left > 0 ? fmtRemain(left) : "يكتمل…"}</span>
        ) : maxed ? (
          <span className="text-sm text-faint">الغاية</span>
        ) : (
          <Btn disabled={busy || queued || Boolean(lack)} onClick={() => onUpgrade(spec.slot)}>
            {level === 0 ? "ابدأ" : `ارفع إلى ${fmt(level + 1)}`}
          </Btn>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">{blurb(spec.good)}</p>
      <ul className="mt-3 space-y-1 text-xs">
        <li className="flex justify-between gap-3">
          <span className="text-muted">إنتاج هذا الحقل</span>
          <span className="tabular-nums text-oasis">{fmt(fieldRate(spec.good, level) * 60)} / ساعة</span>
        </li>
        {!maxed && (
          <li className="flex justify-between gap-3">
            <span className="text-muted">بعد الرفع</span>
            <span className="tabular-nums text-fg">{fmt(fieldRate(spec.good, level + 1) * 60)} / ساعة</span>
          </li>
        )}
      </ul>
      {next && !mine && <p className="mt-2 text-xs text-muted">{costParts(next).join(" · ")} · {fmt(next.seconds)} ث</p>}
      {queued && !mine && <p className="mt-2 text-xs text-accent">طابور البناء مشغول.</p>}
      {lack && !mine && <p className="mt-1 text-xs text-danger">{lack}</p>}
    </article>
  );
}

function blurb(good: FieldGood) {
  if (good === "water") return "عين في الوادي. البئر داخل المضارب يزيد كل العيون.";
  if (good === "food") return "نخيل يطعم القبيلة. المزرعة تزيد كل الحقول.";
  if (good === "wood") return "أثل وسمر. الورشة تزيد كل الأحطاب.";
  return "مقلع حجر للبناء. الورشة تزيد المقالع.";
}

function BuildingCard({
  you,
  now,
  kind,
  busy,
  queued,
  onUpgrade,
}: {
  you: YouState;
  now: number;
  kind: BuildingKind;
  busy: boolean;
  queued: boolean;
  onUpgrade: (kind: BuildingKind) => void;
}) {
  const building = you.buildings.find((item) => item.kind === kind);
  if (!building) return null;
  const def = BUILDINGS[kind];
  const maxed = building.level >= def.max;
  const left = building.upgradeUntil ? building.upgradeUntil - now : 0;
  const next = maxed ? null : upgradeCost(kind, building.level + 1);
  const lack = next ? shortage(you, next) : null;
  const yields = maxed || building.upgradeUntil != null ? [] : upgradeYield(you, kind);
  const mine = building.upgradeUntil != null;
  return (
    <article className="rounded-xl border border-accent/40 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{def.label}</h3>
          <p className="text-sm text-faint">{building.level > 0 ? `مستوى ${fmt(building.level)}` : "لم يُبنَ بعد"}</p>
        </div>
        {mine ? (
          <span className="tabular-nums text-sm text-accent">{left > 0 ? fmtRemain(left) : "يكتمل…"}</span>
        ) : maxed ? (
          <span className="text-sm text-faint">الغاية</span>
        ) : (
          <Btn disabled={busy || queued || Boolean(lack)} onClick={() => onUpgrade(kind)}>
            {building.level === 0 ? "ابْنِ" : "طوّر"}
          </Btn>
        )}
      </div>
      <p className="mt-2 text-sm text-pretty text-muted">{def.blurb}</p>
      {yields.length > 0 && (
        <ul className="mt-3 space-y-1">
          {yields.map((line) => (
            <li key={line.label} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted">{line.label}</span>
              <span className="tabular-nums text-oasis" dir="ltr">
                {line.now} → {line.next}
              </span>
            </li>
          ))}
        </ul>
      )}
      {next && !mine && <p className="mt-2 text-xs text-muted">{costParts(next).join(" · ")}</p>}
      {queued && !mine && <p className="mt-2 text-xs text-accent">طابور البناء مشغول.</p>}
      {lack && !mine && <p className="mt-1 text-xs text-danger">{lack}</p>}
    </article>
  );
}

function Ground({ view }: { view: "fields" | "yard" }) {
  return (
    <svg viewBox="0 0 360 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="oasisSand" cx="50%" cy="48%" r="72%">
          <stop offset="0%" stopColor="color-mix(in oklab, var(--color-fg) 18%, var(--color-dune))" />
          <stop offset="62%" stopColor="var(--color-dune)" />
          <stop offset="100%" stopColor="var(--color-sand)" />
        </radialGradient>
      </defs>
      <rect width="360" height="360" fill="var(--color-sand)" />
      <circle cx="180" cy="180" r="176" fill="url(#oasisSand)" />
      <path d="M8 150 Q70 90 20 40" fill="none" stroke="color-mix(in oklab, var(--color-accent) 30%, var(--color-sand))" strokeWidth="22" />
      <path d="M340 250 Q280 300 330 340" fill="none" stroke="color-mix(in oklab, var(--color-danger) 25%, var(--color-dune))" strokeWidth="18" />
      {view === "fields" ? (
        <>
          <ellipse cx="180" cy="180" rx="130" ry="122" fill="none" stroke="color-mix(in oklab, var(--color-accent) 45%, var(--color-sand))" strokeWidth="10" />
          <ellipse cx="180" cy="180" rx="72" ry="65" fill="none" stroke="color-mix(in oklab, var(--color-accent) 28%, var(--color-sand))" strokeWidth="7" />
          <circle cx="180" cy="180" r="34" fill="color-mix(in oklab, var(--color-danger) 28%, var(--color-dune))" />
        </>
      ) : (
        <>
          <circle cx="180" cy="176" r="150" fill="none" stroke="color-mix(in oklab, var(--color-danger) 55%, var(--color-dune))" strokeWidth="8" />
          <line x1="180" y1="166" x2="108" y2="108" stroke="color-mix(in oklab, var(--color-accent) 40%, var(--color-sand))" strokeWidth="8" />
          <line x1="180" y1="166" x2="259" y2="101" stroke="color-mix(in oklab, var(--color-accent) 40%, var(--color-sand))" strokeWidth="8" />
          <line x1="180" y1="166" x2="97" y2="252" stroke="color-mix(in oklab, var(--color-accent) 40%, var(--color-sand))" strokeWidth="8" />
          <line x1="180" y1="166" x2="266" y2="245" stroke="color-mix(in oklab, var(--color-accent) 40%, var(--color-sand))" strokeWidth="8" />
        </>
      )}
      <ellipse cx="54" cy="300" rx="20" ry="7" fill="var(--color-pool)" />
      <Palm x={42} y={70} s={1} />
      <Palm x={70} y={48} s={0.75} />
      <Palm x={300} y={58} s={0.9} />
      <Palm x={318} y={250} s={0.8} />
      <Palm x={36} y={250} s={0.85} />
    </svg>
  );
}

function Palm({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 2 C-1 -14 1 -26 0 -36" stroke="color-mix(in oklab, var(--color-accent) 45%, var(--color-dune))" strokeWidth="2" fill="none" />
      <path d="M0 -32 Q-16 -28 -18 -14" stroke="var(--color-oasis)" strokeWidth="1.6" fill="none" />
      <path d="M0 -34 Q16 -30 18 -16" stroke="var(--color-oasis)" strokeWidth="1.6" fill="none" />
      <path d="M0 -36 Q-4 -48 6 -46" stroke="var(--color-oasis)" strokeWidth="1.5" fill="none" />
    </g>
  );
}

function FieldMark({ good }: { good: FieldGood }) {
  if (good === "water") {
    return (
      <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
        <ellipse cx="11" cy="8" rx="8" ry="3.5" fill="color-mix(in oklab, var(--color-oasis) 55%, var(--color-fg))" />
      </svg>
    );
  }
  if (good === "food") {
    return (
      <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
        <path d="M6 14 C6 6 8 4 11 2 C14 4 16 6 16 14" fill="none" stroke="var(--color-oasis-fg)" strokeWidth="1.3" />
        <path d="M11 4 Q4 6 3 10" stroke="var(--color-oasis-fg)" strokeWidth="1" fill="none" />
        <path d="M11 4 Q18 6 19 10" stroke="var(--color-oasis-fg)" strokeWidth="1" fill="none" />
      </svg>
    );
  }
  if (good === "wood") {
    return (
      <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
        <path d="M7 14 L9 4 L11 14 M13 14 L15 3 L17 14" fill="none" stroke="var(--color-accent)" strokeWidth="1.3" />
      </svg>
    );
  }
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
      <path d="M3 12 L7 4 L12 12 Z M10 12 L15 5 L20 12 Z" fill="color-mix(in oklab, var(--color-danger) 70%, var(--color-fg))" />
    </svg>
  );
}

function TentMark({ large }: { large?: boolean }) {
  return (
    <svg width={large ? 64 : 36} height={large ? 36 : 22} viewBox="0 0 64 36" aria-hidden="true">
      <path d="M4 32 L32 6 L60 32 Z" fill="color-mix(in oklab, var(--color-bg) 40%, var(--color-dune))" stroke="var(--color-fg)" strokeWidth="1.4" />
      <path d="M14 32 L32 14 L50 32" fill="none" stroke="var(--color-accent)" strokeWidth="1.2" />
      <path d="M32 6 L40 10 L32 9 Z" fill="var(--color-danger)" />
    </svg>
  );
}

function YardMark({ kind, built }: { kind: BuildingKind; built: boolean }) {
  const line = built ? "var(--color-fg)" : "var(--color-faint)";
  return (
    <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true">
      {kind === "well" && (
        <>
          <ellipse cx="20" cy="20" rx="10" ry="4" fill="var(--color-pool)" stroke={line} />
          <path d="M12 20 V10 H28 V20" fill="none" stroke="var(--color-accent)" strokeWidth="1.4" />
        </>
      )}
      {kind === "farm" && <path d="M8 22 C8 10 12 6 20 4 C28 6 32 10 32 22" fill="none" stroke="var(--color-oasis)" strokeWidth="1.5" />}
      {kind === "workshop" && <path d="M6 24 L20 8 L34 24 Z" fill="none" stroke={line} strokeWidth="1.4" />}
      {kind === "storehouse" && (
        <>
          <rect x="8" y="10" width="24" height="14" fill="none" stroke={line} strokeWidth="1.3" />
          <path d="M8 10 L20 4 L32 10 M14 24 V16 H26 V24" fill="none" stroke="var(--color-accent)" strokeWidth="1" />
        </>
      )}
      {kind === "barracks" && (
        <>
          <path d="M4 24 L14 10 H28 L36 24 Z" fill="none" stroke={line} strokeWidth="1.3" />
          <path d="M16 8 V24 M24 6 V24" stroke="var(--color-accent)" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}
