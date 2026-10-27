import { useState } from "react";
import {
  BARTER_GET,
  BARTER_GIVE,
  DEFERRED,
  GOODS,
  LINEAGE,
  LINEAGES,
  OATHS,
  PEACE_EXTEND_MIN,
  STUDIES,
  STUDY_KINDS,
  START,
  SUGGESTED_NAMES,
  distance,
  moveQuote,
  paceOf,
  peaceExtendCost,
  playedTrait,
  poetLine,
  RESOURCE_LABEL,
  SCOUT_GOLD,
  TRAIN,
  armyPower,
  attackDropsShield,
  defenseOf,
  barterTake,
  studyOpen,
  TRAITS,
  traitLine,
  trainQuote,
  type BuildingKind,
  type Good,
  type Lineage,
  type OathKind,
  type SheikhTrait,
  type StudyKind,
  type TroopKind,
} from "@/lib/game/balance";
import { costParts, fmt, fmtRemain, shortage } from "@/lib/game/format";
import { developScore, levelMap, rankOf } from "@/lib/game/develop";
import { TERRAIN_LABEL, terrainAt } from "@/lib/game/terrain";
import { PASTURE_REASON, claimCost, claimSteps, pastureBase } from "@/lib/game/pasture";
import type { WorldSnapshot, YouState } from "@/lib/game/types";
import { TribeBanner } from "./Mark";
import { CampMap } from "./CampMap";
import { Btn } from "./ui";

export type GameActions = {
  busy: boolean;
  upgrade: (kind: BuildingKind) => void;
  upgradeField: (slot: number) => void;
  study: (kind: StudyKind) => void;
  expand: () => void;
  peace: () => void;
  train: (kind: TroopKind, qty: number) => void;
  move: (x: number, y: number) => void;
  claimPasture: (x: number, y: number) => void;
  releasePasture: (x: number, y: number) => void;
  spoil: (x: number, y: number, infantry: number, cavalry: number) => void;
  attack: (targetKind: "player" | "bandit" | "saalik", targetId: string, infantry: number, cavalry: number) => void;
  scout: (targetKind: "player" | "bandit", targetId: string) => void;
  hire: (id: number) => void;
  claim: (kind: OathKind) => void;
  barter: (give: Good, take: Good, lots: number) => void;
};

export function FoundPanel({
  busy,
  onFound,
}: {
  busy: boolean;
  onFound: (input: { name: string; sheikh: string; trait: SheikhTrait; lineage: Lineage }) => void;
}) {
  const [name, setName] = useState("");
  const [lineage, setLineage] = useState<Lineage>("azd");
  const people = LINEAGE[lineage];
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 p-5">
      <div>
        <h2 className="font-display text-3xl text-fg">اسمك ثم قبيلتك</h2>
        <p className="mt-2 text-sm text-pretty text-muted">
          الاسم المستعار لك وحدك، ويظهر على الخريطة. القبيلة يشترك فيها من شاء، ومنها الشاعر والميزة. درع المبتدئ {START.peaceMin} دقيقة.
        </p>
      </div>
      <div>
        <p className="text-xs text-faint">الاسم المستعار</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setName(n)}
              className={`min-h-11 rounded-md border px-3 text-sm ${name === n ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface-2 text-fg"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          value={name}
          maxLength={18}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-md border border-line bg-bg px-3 text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="الاسم المستعار"
        />
      </div>
      <div>
        <p className="text-xs text-faint">القبيلة · {people.name}</p>
        <p className="mt-1 text-sm text-muted">
          شاعرها {poetLine(people)}. {people.blurb} {people.gift}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {LINEAGES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setLineage(key)}
              className={`min-h-11 rounded-md border px-3 text-sm ${lineage === key ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface-2 text-fg"}`}
            >
              {LINEAGE[key].name}
            </button>
          ))}
        </div>
      </div>
      <Btn
        disabled={busy || name.trim().length < 2}
        onClick={() => onFound({ name: name.trim(), sheikh: name.trim(), trait: people.trait, lineage })}
      >
        انصب المضارب
      </Btn>
    </div>
  );
}

export function CampPanel({
  you,
  now,
  actions,
  focus = null,
}: {
  you: YouState;
  now: number;
  actions: GameActions;
  focus?: { kind: BuildingKind; at: number } | null;
}) {
  const rank = rankOf(developScore(you));
  const peaceLeft = you.peaceUntil ? you.peaceUntil - now : 0;
  const peaceCost = peaceExtendCost(you.peaceExtends);
  const peaceMiss = shortage(you, peaceCost);

  return (
    <div className="flex flex-col gap-3 p-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <TribeBanner name={you.name} />
            <div className="min-w-0">
              <p className="text-xs text-accent">خريطة المضارب</p>
              <h2 className="truncate font-display text-2xl leading-none">{you.name}</h2>
            </div>
          </div>
          <p className="text-end text-xs text-faint">
            {you.poet ? LINEAGE[you.lineage as Lineage]?.name ?? TRAITS[you.trait].label : TRAITS[you.trait].label}
            <br />
            {rank.current.name}
          </p>
        </div>
        <p className="mt-2 text-sm text-muted">
          الشيخ {you.sheikh}
          {you.poet ? ` · شاعرها ${you.poet}. ${LINEAGE[you.lineage as Lineage]?.gift ?? ""}` : ` · ${traitLine(you.trait, you.renown)}`}
        </p>
        {you.pacts > 0 && <p className="mt-1 text-xs text-faint">صعلوك مبايع. من المغرب إلى الفجر غارتك بلا اسم، والطليعة تبقى مكشوفة.</p>}
      </section>

      <CampMap you={you} now={now} actions={actions} focus={focus} />

      <OathBoard you={you} actions={actions} />
      <Market you={you} actions={actions} />

      <Diwan you={you} now={now} actions={actions} />

      <article className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">سلسلة الحمى</h3>
            <p className="text-sm text-faint">
              {fmt(you.chain.owned)} / {fmt(you.chain.limit)} مربع · {fmt(you.chain.live)} يعمل
            </p>
          </div>
          {you.chain.claim ? (
            <span className="tabular-nums text-sm text-accent">{fmtRemain(you.chain.claim.until - now)}</span>
          ) : (
            <span className="text-sm text-faint">من الخريطة</span>
          )}
        </div>
        <p className="mt-2 text-sm text-pretty text-muted">
          تضم من الخريطة مربعاً ملاصقاً. الحد {fmt(you.chain.limit)}، والزائد يُسكت. النزاع يقطع ما خلفه.
        </p>
        <p className="mt-2 text-xs text-muted">
          من المراعي: {fmt(you.chain.water)} ماء · {fmt(you.chain.food)} طعام · {fmt(you.chain.wood)} خشب · {fmt(you.chain.stone)} حجر / د
        </p>
      </article>

      <article className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">درع المبتدئ</h3>
            <p className="text-sm text-faint">
              {you.attacked ? "سقط لأنك هاجمت قبيلة" : peaceLeft > 0 ? `باقٍ ${fmtRemain(peaceLeft)}` : "ساقط"}
            </p>
          </div>
          {!you.attacked && (
            <Btn disabled={actions.busy || Boolean(peaceMiss)} onClick={actions.peace}>
              مدّ {PEACE_EXTEND_MIN} د
            </Btn>
          )}
        </div>
        {!you.attacked && <p className="mt-2 text-xs text-muted">{costParts(peaceCost).join(" · ")}</p>}
        {peaceMiss && !you.attacked && <p className="mt-1 text-xs text-danger">{peaceMiss}</p>}
      </article>
    </div>
  );
}

function Diwan({ you, now, actions }: { you: YouState; now: number; actions: GameActions }) {
  const levels = levelMap(you);
  const queue = you.studies.some((study) => study.finishAt != null);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium">الديوان</h3>
        <p className="mt-1 text-sm text-pretty text-muted">دراسة واحدة في كل مرة. إذا أُنجزت بقيت أثرها.</p>
      </div>
      {STUDY_KINDS.map((kind) => {
        const def = STUDIES[kind];
        const view = you.studies.find((study) => study.kind === kind) ?? { kind, done: false, finishAt: null };
        const open = studyOpen(levels, kind);
        const left = view.finishAt ? view.finishAt - now : 0;
        const lack = open && !view.done && view.finishAt == null ? shortage(you, def.cost) : null;
        return (
          <article key={kind} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{def.label}</h3>
                <p className="text-sm text-faint">
                  {view.done ? "قائم" : view.finishAt != null ? "قيد الإتمام" : open ? "متاح" : def.needs}
                </p>
              </div>
              {view.done ? (
                <span className="text-sm text-oasis">أُنجز</span>
              ) : view.finishAt != null ? (
                <span className="tabular-nums text-sm text-accent">{left > 0 ? fmtRemain(left) : "يكتمل…"}</span>
              ) : (
                <Btn disabled={actions.busy || !open || queue || Boolean(lack)} onClick={() => actions.study(kind)}>
                  ادرس
                </Btn>
              )}
            </div>
            <p className="mt-2 text-sm text-pretty text-muted">{def.blurb}</p>
            {!view.done && view.finishAt == null && open && (
              <p className="mt-2 text-xs text-muted">{costParts(def.cost).join(" · ")}</p>
            )}
            {lack && !queue && <p className="mt-1 text-xs text-danger">{lack}</p>}
          </article>
        );
      })}
    </section>
  );
}

export function ArmyPanel({ you, now, actions }: { you: YouState; now: number; actions: GameActions }) {
  const [inf, setInf] = useState(5);
  const [cav, setCav] = useState(2);
  const barracks = you.buildings.find((b) => b.kind === "barracks")?.level ?? 0;
  const trainLeft = you.training ? you.training.finishAt - now : 0;
  const infCost = trainQuote("infantry", inf, Math.max(1, barracks));
  const cavCost = trainQuote("cavalry", cav, Math.max(1, barracks));
  const home = you.infantry + you.cavalry;
  const tent = you.buildings.find((b) => b.kind === "tent")?.level ?? 1;
  const rampart = you.studies.some((study) => study.kind === "rampart" && study.done);
  const attack = armyPower(you.infantry, you.cavalry);
  const wall = defenseOf(tent, rampart);
  const hold = you.infantry * TRAIN.infantry.def + you.cavalry * TRAIN.cavalry.def + wall;

  return (
    <div className="flex flex-col gap-3 p-4">
      <article className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-medium">في المضارب</h3>
        <p className="mt-2 tabular-nums text-sm text-muted">
          {fmt(you.infantry)} مشاة · {fmt(you.cavalry)} فرسان
        </p>
        <p className="mt-1 tabular-nums text-sm">
          هجوم {fmt(attack)} · دفاع المضارب {fmt(hold)}
        </p>
        <p className="mt-1 text-xs text-pretty text-faint">
          المشاة {TRAIN.infantry.atk} هجوم و{TRAIN.infantry.def} دفاع. الفارس {TRAIN.cavalry.atk} هجوم و{TRAIN.cavalry.def} دفاع. الخيمة تضيف {fmt(wall)} للدفاع. النصر لمن علا رقمه بعد رمية بين ٩٠٪ و١١٠٪، والخسارة نسبة من قوة الخصم.
        </p>
        <p className="mt-1 text-xs text-faint">
          خارج المضارب {fmt(you.outbound)} · الحد {fmt(you.armyCap)} · المجموع معك {fmt(home + you.outbound)}
        </p>
      </article>
      {you.training && (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm">
          تدريب {you.training.qty} {you.training.kind === "cavalry" ? "فرسان" : "مشاة"} ·{" "}
          <span className="tabular-nums text-accent">{fmtRemain(trainLeft)}</span>
        </p>
      )}
      <TrainBlock
        label="مشاة"
        qty={inf}
        setQty={setInf}
        cost={infCost}
        you={you}
        locked={barracks < 1 || Boolean(you.training)}
        note={barracks < 1 ? "ابْنِ الثكنة أولًا." : you.training ? "الثكنة مشغولة." : null}
        busy={actions.busy}
        onTrain={() => actions.train("infantry", inf)}
      />
      <TrainBlock
        label="فرسان"
        qty={cav}
        setQty={setCav}
        cost={cavCost}
        you={you}
        locked={barracks < 1 || Boolean(you.training)}
        note={barracks < 1 ? "ابْنِ الثكنة أولًا." : null}
        busy={actions.busy}
        onTrain={() => actions.train("cavalry", cav)}
      />
    </div>
  );
}

function TrainBlock({
  label,
  qty,
  setQty,
  cost,
  you,
  locked,
  note,
  busy,
  onTrain,
}: {
  label: string;
  qty: number;
  setQty: (n: number) => void;
  cost: ReturnType<typeof trainQuote>;
  you: YouState;
  locked: boolean;
  note: string | null;
  busy: boolean;
  onTrain: () => void;
}) {
  const lack = shortage(you, cost);
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{label}</h3>
        <div className="flex items-center gap-2">
          <button type="button" className="grid size-11 place-items-center rounded-md border border-line" onClick={() => setQty(Math.max(1, qty - 1))}>
            −
          </button>
          <span className="w-8 text-center tabular-nums">{qty}</span>
          <button type="button" className="grid size-11 place-items-center rounded-md border border-line" onClick={() => setQty(Math.min(40, qty + 1))}>
            +
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">{costParts(cost).join(" · ")}</p>
      {lack && <p className="mt-1 text-xs text-danger">{lack}</p>}
      {note && <p className="mt-1 text-xs text-faint">{note}</p>}
      <Btn className="mt-3 w-full" disabled={busy || locked || Boolean(lack)} onClick={onTrain}>
        درّب
      </Btn>
    </article>
  );
}

export function ReportsPanel({ world }: { world: WorldSnapshot }) {
  if (!world.reports.length) {
    return <p className="p-5 text-sm text-pretty text-muted">لم تصل تقارير بعد. أرسل طليعة أو انتظر ما يأتي من التخوم.</p>;
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      {world.reports.map((report) => (
        <article key={report.id} className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium">{report.title}</h3>
            <span
              className={`text-xs ${report.victory === true ? "text-oasis" : report.victory === false ? "text-danger" : "text-faint"}`}
            >
              {report.victory === true ? "تقدم" : report.victory === false ? "خسارة" : "خبر"}
            </span>
          </div>
          <p className="mt-2 text-sm text-pretty text-muted">{report.body}</p>
        </article>
      ))}
    </div>
  );
}

export function TileSheet({
  world,
  x,
  y,
  now,
  actions,
}: {
  world: WorldSnapshot;
  x: number;
  y: number;
  now: number;
  actions: GameActions;
}) {
  const you = world.you;
  const camp = world.camps.find((c) => c.x === x && c.y === y);
  const bandit = world.bandits.find((b) => b.x === x && b.y === y);
  const terrain = TERRAIN_LABEL[terrainAt(x, y)];

  if (!you) return null;

  if (camp?.own) {
    return (
      <div className="p-4">
        <h3 className="font-medium">مضارب {camp.name}</h3>
        <p className="mt-1 text-sm text-muted">
          الشيخ {you.sheikh} · {LINEAGE[you.lineage as Lineage]?.name ?? TRAITS[you.trait].label} · {terrain}
          {camp.peace ? " · الدرع قائم" : ""}
        </p>
        <p className="mt-2 text-sm text-pretty text-muted">
          الحقول هنا تُرفع من التطوير. الحمى سلسلة على الخريطة: {fmt(you.chain.owned)} / {fmt(you.chain.limit)}، منها {fmt(you.chain.live)} يعمل.
        </p>
      </div>
    );
  }

  if (camp) {
    const known = (world.intel ?? []).find((item) => item.targetKind === "player" && item.targetId === camp.id && item.until > now);
    return (
      <AttackBox
        title={camp.name}
        detail={`${camp.people || "قبيلة"} · ${terrain} · خيمة ${camp.tent}`}
        intel={known?.detail ?? null}
        locked={known?.detail.includes("الدرع قائم") ?? false}
        lockedNote="الدرع قائم. الطليعة رأته."
        you={you}
        dist={distance(you.x, you.y, camp.x, camp.y)}
        warn={!you.attacked}
        busy={actions.busy}
        scouting={world.marches.some((march) => march.purpose === "scout" && march.role === "out")}
        onScout={() => actions.scout("player", camp.id)}
        onSend={(infantry, cavalry) => actions.attack("player", camp.id, infantry, cavalry)}
      />
    );
  }

  if (bandit) {
    const known = (world.intel ?? []).find((item) => item.targetKind === "bandit" && item.targetId === String(bandit.id) && item.until > now);
    return (
      <AttackBox
        title={bandit.label}
        detail={terrain}
        intel={known?.detail ?? null}
        locked={false}
        you={you}
        dist={distance(you.x, you.y, bandit.x, bandit.y)}
        warn={!you.attacked && attackDropsShield("bandit")}
        busy={actions.busy}
        scouting={world.marches.some((march) => march.purpose === "scout" && march.role === "out")}
        onScout={() => actions.scout("bandit", String(bandit.id))}
        onSend={(infantry, cavalry) => actions.attack("bandit", String(bandit.id), infantry, cavalry)}
      />
    );
  }

  const outlaw = (world.saalik ?? []).find((man) => man.x === x && man.y === y);
  if (outlaw) {
    const goldShort = you.gold < outlaw.gold;
    const foodShort = you.food < outlaw.food;
    return (
      <div>
        <div className="p-4 pb-0">
          <p className="text-xs text-accent">صعلوك</p>
          <h3 className="font-medium">{outlaw.name}</h3>
          <p className="mt-1 text-sm text-pretty text-muted">{outlaw.line}</p>
          <p className="mt-2 text-sm text-fg">
            {fmt(outlaw.cavalry)} فرسان · البيعة {fmt(outlaw.gold)} ذهب و{fmt(outlaw.food)} طعام
          </p>
          <p className="mt-1 text-xs text-oasis">البيعة لا تُسقط الدرع، وتزيد صيت الشيخ. بعدها، من المغرب إلى الفجر، غارتك بلا اسم. قتال الصعاليك والعصابات لا يُسقط الدرع، ومهاجمة مضارب قبيلة تُسقطه.</p>
          <Btn className="mt-3 w-full" disabled={actions.busy || goldShort || foodShort} onClick={() => actions.hire(outlaw.id)}>
            بايع الفرسان
          </Btn>
          {(goldShort || foodShort) && <p className="mt-1 text-xs text-danger">الذهب أو الطعام لا يكفي للبيعة.</p>}
        </div>
        <AttackBox
          title="أو واجههم"
          detail={terrain}
          intel={`قوة ظاهرة: ${fmt(outlaw.cavalry)} فرسان، ولا مشاة.`}
          locked={false}
          you={you}
          dist={distance(you.x, you.y, outlaw.x, outlaw.y)}
          warn={!you.attacked && attackDropsShield("saalik")}
          busy={actions.busy}
          scouting={false}
          allowScout={false}
          onScout={() => undefined}
          onSend={(infantry, cavalry) => actions.attack("saalik", String(outlaw.id), infantry, cavalry)}
        />
      </div>
    );
  }

  const quote = moveQuote(distance(you.x, you.y, x, y), you.movesDone);
  const moving = you.move != null;
  const pasture = (world.pastures ?? []).find((cell) => cell.x === x && cell.y === y);
  const bridges = (world.pastures ?? []).filter((cell) => cell.own && cell.bridge);
  const steps = claimSteps({ x: you.x, y: you.y }, bridges, { x, y });
  const quoteClaim = steps != null ? claimCost(steps) : null;
  const base = pastureBase(x, y);
  const landName = base.good === "water" ? "مجرى" : base.good === "food" ? "واحة" : base.good === "wood" ? "عشب" : base.good === "stone" ? "كثيب" : "رمل";
  const claiming = you.chain.claim != null;
  const lackClaim = quoteClaim != null && (you.food < quoteClaim.food || you.gold < quoteClaim.gold);
  const lack = you.gold < quote.gold;
  const blockedMove = Boolean(pasture);
  return (
    <div className="p-4">
      <h3 className="font-medium">{pasture ? landName : terrain}</h3>
      <p className="mt-1 text-sm text-muted">
        موضع {x}، {y}
        {pasture?.dispute ? " · نزاع" : pasture?.own ? " · سلسلتك" : pasture?.foreign ? " · سلسلة غيرك" : ""}
      </p>
      {pasture && (
        <p className="mt-2 text-sm text-fg">
          {pasture.dispute || pasture.silent
            ? `صامت · ${PASTURE_REASON[pasture.reason]}`
            : pasture.rate > 0
              ? `${fmt(pasture.rate)} / د · ${fmt(pasture.rate * 60)} / س`
              : "درب بلا إنتاج"}
        </p>
      )}
      {!pasture && <p className="mt-2 text-sm text-muted">{landName === "رمل" ? "رمل مشاع. يُضم درباً ولا ينتج." : `${landName} مشاع. ينتج إن دخل السلسلة.`}</p>}
      {quoteClaim && !pasture?.own && (
        <>
          <p className="mt-2 text-xs text-muted">
            الضم: {fmt(quoteClaim.food)} طعام · {fmt(quoteClaim.gold)} ذهب · {fmtRemain(quoteClaim.seconds * 1000)} · على بعد {fmt(steps ?? 0)}
          </p>
          <Btn className="mt-3 w-full" disabled={actions.busy || claiming || lackClaim} onClick={() => actions.claimPasture(x, y)}>
            ضم إلى السلسلة
          </Btn>
          {lackClaim && <p className="mt-1 text-xs text-danger">الطعام أو الذهب لا يكفي.</p>}
          {claiming && <p className="mt-1 text-xs text-accent">ضمّ آخر جارٍ.</p>}
        </>
      )}
      {pasture?.own && (
        <Btn className="mt-3 w-full" variant="ghost" disabled={actions.busy} onClick={() => actions.releasePasture(x, y)}>
          أسقط المربع
        </Btn>
      )}
      {pasture && (pasture.foreign || pasture.reason === "intruder") && (
        <SpoilBox
          you={you}
          busy={actions.busy}
          label={pasture.own ? "طهر المرعى" : "أسكت المرعى"}
          onSend={(infantry, cavalry) => actions.spoil(x, y, infantry, cavalry)}
        />
      )}
      <p className="mt-3 text-xs text-muted">
        النقل: {fmt(quote.gold)} ذهب · {fmtRemain(quote.seconds * 1000)}
        {you.movesDone === 0 ? " · أول نقلة أخف" : ""}
        {blockedMove ? " · المربع داخل سلسلة" : ""}
      </p>
      {you.move && (
        <p className="mt-1 text-xs text-accent">
          نقل جارٍ نحو {you.move.x}، {you.move.y} · {fmtRemain(you.move.until - now)}
        </p>
      )}
      <Btn className="mt-3 w-full" variant="ghost" disabled={actions.busy || moving || blockedMove || lack} onClick={() => actions.move(x, y)}>
        انقل المضارب إلى هنا
      </Btn>
      {lack && !moving && !blockedMove && <p className="mt-1 text-xs text-danger">الذهب لا يكفي.</p>}
    </div>
  );
}

function SpoilBox({
  you,
  busy,
  label,
  onSend,
}: {
  you: YouState;
  busy: boolean;
  label: string;
  onSend: (infantry: number, cavalry: number) => void;
}) {
  const [infantry, setInfantry] = useState(() => Math.min(4, you.infantry));
  const [cavalry, setCavalry] = useState(() => Math.min(2, you.cavalry));
  const bad = infantry + cavalry < 1 || infantry > you.infantry || cavalry > you.cavalry;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-xs text-muted">قتال المرعى خسائر بلا غنيمة مخزن. الغنيمة لا تُؤخذ إلا من الديرة.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          مشاة
          <input
            type="number"
            min={0}
            max={you.infantry}
            value={infantry}
            onChange={(event) => setInfantry(Number(event.target.value))}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-2 text-fg"
          />
        </label>
        <label className="text-xs text-muted">
          فرسان
          <input
            type="number"
            min={0}
            max={you.cavalry}
            value={cavalry}
            onChange={(event) => setCavalry(Number(event.target.value))}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-2 text-fg"
          />
        </label>
      </div>
      <Btn className="mt-2 w-full" disabled={busy || bad} onClick={() => onSend(infantry, cavalry)}>
        {label}
      </Btn>
    </div>
  );
}

function AttackBox({
  title,
  detail,
  intel,
  locked,
  lockedNote,
  you,
  dist,
  warn,
  busy,
  scouting,
  allowScout = true,
  onScout,
  onSend,
}: {
  title: string;
  detail: string;
  intel: string | null;
  locked: boolean;
  lockedNote?: string;
  you: YouState;
  dist: number;
  warn: boolean;
  busy: boolean;
  scouting: boolean;
  allowScout?: boolean;
  onScout: () => void;
  onSend: (infantry: number, cavalry: number) => void;
}) {
  const [infantry, setInfantry] = useState(() => Math.min(8, you.infantry));
  const [cavalry, setCavalry] = useState(() => Math.min(2, you.cavalry));
  const fast = you.studies.some((study) => study.kind === "scouts" && study.done);
  const eta = paceOf(dist, fast, playedTrait(you.lineage, you.trait) ?? "guard", you.renown);
  const sent = armyPower(infantry, cavalry);
  const tooMany = infantry > you.infantry || cavalry > you.cavalry || infantry + cavalry < 1;
  const goldShort = you.gold < SCOUT_GOLD;
  return (
    <div className="p-4">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted">{detail}</p>
      {intel ? (
        <p className="mt-2 text-sm text-pretty text-fg">{intel}</p>
      ) : (
        <p className="mt-2 text-sm text-pretty text-muted">القوة مجهولة حتى تعود الطليعة. الاستطلاع لا يُسقط الدرع.</p>
      )}
      <p className="mt-2 text-xs text-faint">
        المسير {fmtRemain(eta * 1000)} · ترسل هجوماً قدره {fmt(sent)} · في المضارب {fmt(you.infantry)} مشاة و{fmt(you.cavalry)} فرسان
      </p>
      {allowScout && (
        <Btn className="mt-3 w-full" variant="ghost" disabled={busy || scouting || goldShort} onClick={onScout}>
          {scouting ? "الطليعة في الطريق" : `أرسل طليعة · ${SCOUT_GOLD} ذهب`}
        </Btn>
      )}
      {allowScout && goldShort && !scouting && <p className="mt-1 text-xs text-danger">الذهب لا يكفي للطليعة.</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <CountField label="مشاة" value={infantry} max={you.infantry} onChange={setInfantry} />
        <CountField label="فرسان" value={cavalry} max={you.cavalry} onChange={setCavalry} />
      </div>
      {you.pacts > 0 && (
        <p className="mt-2 text-xs text-muted">في الليل تخرج هذه الغارة بلا اسم، وأصل السهم لا يراه سواك. الطليعة تبقى باسمك.</p>
      )}
      {warn && <p className="mt-2 text-xs text-danger">مهاجمة مضارب قبيلة تُسقط درع المبتدئ. الطليعة لا تُسقطه.</p>}
      {locked && lockedNote && <p className="mt-2 text-xs text-muted">{lockedNote}</p>}
      <Btn className="mt-3 w-full" variant="danger" disabled={busy || locked || tooMany} onClick={() => onSend(infantry, cavalry)}>
        أرسل الهجوم
      </Btn>
    </div>
  );
}

function CountField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="rounded-md border border-line bg-surface-2 p-2 text-sm">
      <span className="text-faint">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
        className="mt-1 w-full bg-transparent tabular-nums text-fg outline-none"
      />
    </label>
  );
}

function OathBoard({ you, actions }: { you: YouState; actions: GameActions }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-accent">عهود الوادي</p>
      <ul className="mt-3 flex flex-col gap-3">
        {(you.oaths ?? []).map((oath) => {
          const def = OATHS[oath.kind];
          return (
            <li key={oath.kind} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">{def.title}</p>
                <p className="text-xs text-pretty text-muted">
                  {def.detail} · {def.reward}
                </p>
              </div>
              {oath.claimed ? (
                <span className="shrink-0 text-xs text-oasis">قُبض</span>
              ) : (
                <Btn disabled={actions.busy || !oath.done} onClick={() => actions.claim(oath.kind)}>
                  اقبض
                </Btn>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Market({ you, actions }: { you: YouState; actions: GameActions }) {
  const [give, setGive] = useState<Good>("wood");
  const [take, setTake] = useState<Good>("food");
  const [lots, setLots] = useState(4);
  const have = you[give];
  const maxLots = Math.min(8, Math.floor(have / BARTER_GIVE));
  const used = Math.max(1, Math.min(lots, Math.max(1, maxLots)));
  const giveN = used * BARTER_GIVE;
  const takeEach = you.lineage ? barterTake(you.lineage, 1) : BARTER_GET;
  const getN = used * takeEach;
  const room = (take === "gold" ? you.goldCap : you.storageCap) - you[take];
  const blocked = give === take || maxLots < 1 || giveN > have || getN > room;
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-accent">سوق المضارب</p>
      <p className="mt-1 text-sm text-muted">كل {BARTER_GIVE} تُعطي {takeEach}. الذهب والخشب والحجر والماء والطعام.</p>
      <p className="mt-3 text-xs text-faint">تُعطي</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {GOODS.map((good) => (
          <button
            key={good}
            type="button"
            onClick={() => setGive(good)}
            className={`min-h-11 rounded-md border px-3 text-sm ${give === good ? "border-accent bg-accent text-accent-fg" : "border-line text-fg"}`}
          >
            {RESOURCE_LABEL[good]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-faint">تأخذ</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {GOODS.map((good) => (
          <button
            key={good}
            type="button"
            onClick={() => setTake(good)}
            className={`min-h-11 rounded-md border px-3 text-sm ${take === good ? "border-accent bg-accent text-accent-fg" : "border-line text-fg"}`}
          >
            {RESOURCE_LABEL[good]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm tabular-nums">
          تعطي {fmt(giveN)} {RESOURCE_LABEL[give]} وتأخذ {fmt(getN)} {RESOURCE_LABEL[take]}
        </p>
        <div className="flex gap-1">
          <button type="button" aria-label="أقل" onClick={() => setLots((n) => Math.max(1, n - 1))} className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line">
            −
          </button>
          <button type="button" aria-label="أكثر" onClick={() => setLots((n) => Math.min(8, n + 1))} className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line">
            +
          </button>
        </div>
      </div>
      <Btn className="mt-3 w-full" disabled={actions.busy || blocked} onClick={() => actions.barter(give, take, used)}>
        بدّل
      </Btn>
      {give === take && <p className="mt-2 text-xs text-danger">اختر موردين مختلفين.</p>}
      {give !== take && maxLots < 1 && <p className="mt-2 text-xs text-danger">ما معك لا يكفي لأصغر دفعة.</p>}
      {give !== take && getN > room && <p className="mt-2 text-xs text-danger">خيمة الشيخ لا تتسع.</p>}
    </section>
  );
}

export function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-bg/80 p-4 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[80%] w-full max-w-md overflow-auto rounded-xl bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="about-title"
      >
        <h2 id="about-title" className="font-display text-2xl">
          بعد مأرب
        </h2>
        <p className="mt-3 text-sm text-pretty text-muted">
          نسخة للتجربة: عالم واحد، شيخ لكل قبيلة، وحمى يُضم مربعاً مربعاً. سوق يبدّل الفائض، وعهود تُقبض مرة. صعاليك تُبايَع أو تُحارَب على الخريطة. الغنيمة من الديرة فقط.
          المؤقتات أقصر من اللعبة الكاملة حتى تُختبر الحلقة في دقائق.
        </p>
        <h3 className="mt-4 font-medium">أُجّل عمداً</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {DEFERRED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Btn className="mt-5 w-full" variant="ghost" onClick={onClose}>
          عودة
        </Btn>
      </div>
    </div>
  );
}
