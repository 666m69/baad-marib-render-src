/** Every tunable number for بعد مأرب lives here. */

export const WORLD = 32;

export const BUILDING_KINDS = ["tent", "well", "farm", "workshop", "barracks", "storehouse"] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export const TROOP_KINDS = ["infantry", "cavalry"] as const;
export type TroopKind = (typeof TROOP_KINDS)[number];

export type Cost = {
  water: number;
  food: number;
  gold: number;
  wood: number;
  stone: number;
  people: number;
  seconds: number;
};

export const EMPTY_COST: Cost = {
  water: 0,
  food: 0,
  gold: 0,
  wood: 0,
  stone: 0,
  people: 0,
  seconds: 0,
};

type BuildingDef = {
  label: string;
  blurb: string;
  max: number;
  wood: number;
  stone: number;
  gold: number;
  food: number;
  seconds: number;
};

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  tent: {
    label: "خيمة الشيخ",
    blurb: "بيت المال وقلب المضارب. رفعها يزيد الذهب وسعة بيت المال، وحدّ السكان، والدفاع.",
    max: 8,
    wood: 160,
    stone: 130,
    gold: 70,
    food: 0,
    seconds: 30,
  },
  well: {
    label: "البئر",
    blurb: "يزيد ماء كل العيون. الماء نفسه يُرفع من الحقول.",
    max: 8,
    wood: 80,
    stone: 50,
    gold: 0,
    food: 0,
    seconds: 18,
  },
  farm: {
    label: "المزرعة",
    blurb: "تزيد طعام كل النخيل. الطعام نفسه يُرفع من الحقول.",
    max: 8,
    wood: 80,
    stone: 40,
    gold: 0,
    food: 0,
    seconds: 18,
  },
  workshop: {
    label: "الورشة",
    blurb: "تزيد خشب الأحطاب وحجر المقالع. الحقول هي أصل الخشب والحجر.",
    max: 8,
    wood: 70,
    stone: 110,
    gold: 20,
    food: 0,
    seconds: 22,
  },
  storehouse: {
    label: "المخزن",
    blurb: "بيت الحب والتمر والحطب والحجر. كل مستوى يزيد سعة الماء والطعام والخشب والحجر.",
    max: 10,
    wood: 90,
    stone: 120,
    gold: 0,
    food: 0,
    seconds: 20,
  },
  barracks: {
    label: "الثكنة",
    blurb: "تدرّب المشاة والفرسان. مستواها يسرّع التدريب.",
    max: 8,
    wood: 120,
    stone: 100,
    gold: 45,
    food: 40,
    seconds: 26,
  },
};

export const TRAIN: Record<
  TroopKind,
  Cost & { label: string; atk: number; def: number; carry: number }
> = {
  infantry: {
    label: "مشاة",
    water: 0,
    food: 16,
    gold: 0,
    wood: 8,
    stone: 0,
    people: 1,
    seconds: 8,
    atk: 10,
    def: 13,
    carry: 24,
  },
  cavalry: {
    label: "فرسان",
    water: 8,
    food: 22,
    gold: 18,
    wood: 0,
    stone: 0,
    people: 1,
    seconds: 12,
    atk: 23,
    def: 15,
    carry: 42,
  },
};

export const START = {
  water: 480,
  food: 520,
  gold: 260,
  wood: 420,
  stone: 280,
  people: 26,
  infantry: 12,
  cavalry: 4,
  peaceMin: 18,
  sanctuary: 1,
};

export const MAX_SANCTUARY = 4;
export const SANCTUARY_BONUS = 0.1;
export const PEOPLE_FOOD_GATE = 40;
export const MAX_ACCRUE_SEC = 6 * 60 * 60;
export const LOOT_SHARE = 0.18;

export const MARCH_SEC_PER_TILE = 3.2;
export const MARCH_MIN_SEC = 8;

export const PEACE_EXTEND_MIN = 15;
export const MAX_PEACE_AHEAD_MS = 90 * 60 * 1000;

export const BANDIT_SPAWN_SEC = 70;
export const BANDIT_MIN = 8;
export const BANDIT_MAX = 16;
export const RAID_RANGE = 2;
export const THREAT_RANGE = 4;
export const RAID_COOLDOWN_SEC = 6 * 60;
export const AMBUSH_RANGE = 0;

export const RESOURCE_LABEL: Record<"water" | "food" | "gold" | "wood" | "stone" | "people", string> = {
  water: "ماء",
  food: "طعام",
  gold: "ذهب",
  wood: "خشب",
  stone: "حجر",
  people: "سكان",
};

export function upgradeCost(kind: BuildingKind, nextLevel: number): Cost {
  const b = BUILDINGS[kind];
  const m = Math.pow(1.62, nextLevel - 1);
  const t = Math.pow(1.48, nextLevel - 1);
  return {
    water: 0,
    food: Math.round(b.food * m),
    gold: Math.round(b.gold * m),
    wood: Math.round(b.wood * m),
    stone: Math.round(b.stone * m),
    people: 0,
    seconds: Math.round(b.seconds * t),
  };
}

export function ratesPerMin(
  levels: Record<BuildingKind, number>,
  sanctuary: number,
  fields: { good: FieldGood; level: number }[] = [],
) {
  void sanctuary;
  const bonus = 1;
  const sum = { water: 0, food: 0, wood: 0, stone: 0 };
  for (const field of fields) sum[field.good] += fieldRate(field.good, field.level);
  const well = 1 + levels.well * 0.1;
  const farm = 1 + levels.farm * 0.1;
  const shop = 1 + levels.workshop * 0.08;
  return {
    water: Math.round(sum.water * well * bonus),
    food: Math.round(sum.food * farm * bonus),
    gold: Math.round(11 * Math.max(1, levels.tent) * bonus),
    wood: Math.round(sum.wood * shop * bonus),
    stone: Math.round(sum.stone * shop * bonus),
  };
}

export const FIELD_GOODS = ["water", "food", "wood", "stone"] as const;
export type FieldGood = (typeof FIELD_GOODS)[number];

export const FIELD_LABEL: Record<FieldGood, string> = {
  water: "عين ماء",
  food: "نخيل",
  wood: "محتطب",
  stone: "مقلع",
};

export const FIELD_MAX = 10;

const FIELD_BASE: Record<FieldGood, { rate: number; wood: number; stone: number; seconds: number }> = {
  water: { rate: 7, wood: 45, stone: 25, seconds: 16 },
  food: { rate: 5, wood: 40, stone: 20, seconds: 14 },
  wood: { rate: 6, wood: 55, stone: 30, seconds: 18 },
  stone: { rate: 5, wood: 50, stone: 40, seconds: 18 },
};

function oval(index: number, count: number, rx: number, ry: number, turn: number) {
  const angle = ((turn + (360 / count) * index) * Math.PI) / 180;
  return {
    x: Math.round((50 + Math.cos(angle) * rx) * 10) / 10,
    y: Math.round((50 + Math.sin(angle) * ry) * 10) / 10,
  };
}

const OUTER_GOODS: FieldGood[] = [
  "food",
  "food",
  "food",
  "wood",
  "wood",
  "wood",
  "stone",
  "stone",
  "stone",
  "water",
  "water",
  "water",
];
const INNER_GOODS: FieldGood[] = ["food", "food", "wood", "stone", "water", "water"];

export const FIELD_SLOTS: { slot: number; good: FieldGood; x: number; y: number; start: number }[] = [
  ...OUTER_GOODS.map((good, index) => ({
    slot: index,
    good,
    start: index === 0 || index === 3 || index === 6 || index === 9 ? 1 : 0,
    ...oval(index, 12, 36, 34, -90),
  })),
  ...INNER_GOODS.map((good, index) => ({
    slot: 12 + index,
    good,
    start: index === 0 ? 1 : 0,
    ...oval(index, 6, 20, 18, -60),
  })),
];

export function fieldRate(good: FieldGood, level: number) {
  if (level <= 0) return 0;
  return Math.round(FIELD_BASE[good].rate * Math.pow(1.5, level - 1));
}

export function fieldCost(good: FieldGood, nextLevel: number): Cost {
  const base = FIELD_BASE[good];
  const scale = Math.pow(1.55, nextLevel - 1);
  const time = Math.pow(1.45, nextLevel - 1);
  return {
    water: 0,
    food: 0,
    gold: 0,
    people: 0,
    wood: Math.round(base.wood * scale),
    stone: Math.round(base.stone * scale),
    seconds: Math.round(base.seconds * time),
  };
}

/** Base room for water, food, wood and stone before any storehouse is built. */
export const STORE_BASE = 3000;
/** Extra room per storehouse level (max level 10). */
export const STORE_PER_LEVEL = 1500;
/** Share of the cap at which the bar warns that the storehouse is nearly full. */
export const STORE_WARN = 0.8;

/** Cap for water, food, wood and stone. Only the storehouse raises it; the tent does not. */
export function storageCap(storehouseLevel: number) {
  const level = Math.max(0, Math.min(BUILDINGS.storehouse.max, Math.floor(storehouseLevel || 0)));
  return STORE_BASE + level * STORE_PER_LEVEL;
}

/** Gold has its own cap, held in the sheikh's tent (بيت المال). */
export function goldCap(tentLevel: number) {
  return 2000 + Math.max(1, tentLevel) * 1000;
}

export type Caps = { water: number; food: number; gold: number; wood: number; stone: number };

export function capsOf(levels: Pick<Record<BuildingKind, number>, "tent" | "storehouse">): Caps {
  const goods = storageCap(levels.storehouse ?? 0);
  return { water: goods, food: goods, gold: goldCap(levels.tent || 1), wood: goods, stone: goods };
}

export function emptyLevels(tent = 0): Record<BuildingKind, number> {
  return { tent, well: 0, farm: 0, workshop: 0, barracks: 0, storehouse: 0 };
}

/**
 * Fit an income into the room left under each cap. Anything over the cap is lost,
 * never stored, and reported back so the report can say what spilled.
 */
export function fitIncome(stock: Stock, add: Stock, caps: Caps): { gain: Stock; lost: Stock } {
  const gain: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
  const lost: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
  for (const key of ["water", "food", "gold", "wood", "stone"] as const) {
    const want = Math.max(0, Math.floor(add[key] || 0));
    const room = Math.max(0, caps[key] - Math.max(0, stock[key] || 0));
    gain[key] = Math.min(want, room);
    lost[key] = want - gain[key];
  }
  return { gain, lost };
}

/** Storehouse level an existing tribe needs so the new cap is never below its old tent cap. */
export function storehouseForLegacyTent(tentLevel: number) {
  const legacy = 4500 + Math.max(1, tentLevel) * 1400;
  return Math.min(BUILDINGS.storehouse.max, Math.max(0, Math.ceil((legacy - STORE_BASE) / STORE_PER_LEVEL)));
}

/** Fill ratio and warning band for one resource bar. */
export function capState(value: number, cap: number): "ok" | "warn" | "full" {
  if (cap <= 0) return "full";
  if (value >= cap) return "full";
  if (value >= cap * STORE_WARN) return "warn";
  return "ok";
}

/**
 * Beginner shield rule: only a march on another player's camp drops the shield.
 * Bandit camps and صعاليك are the beginner's training ground and never cost the shield.
 */
export function attackDropsShield(targetKind: string) {
  return targetKind === "player";
}

export function peopleCap(tentLevel: number) {
  return 18 + Math.max(1, tentLevel) * 14;
}

export function armyCap(tentLevel: number) {
  return peopleCap(tentLevel) * 3;
}

export function peopleGrowMs(tentLevel: number) {
  return Math.round(36000 / (1 + Math.max(1, tentLevel) * 0.12));
}

export function wallDefense(tentLevel: number) {
  return Math.max(0, tentLevel) * 28;
}

export const STUDY_KINDS = ["cistern", "fodder", "scouts", "rampart"] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];

export type StudyFlags = {
  cistern: boolean;
  fodder: boolean;
  scouts: boolean;
  rampart: boolean;
};

type StudyDef = {
  label: string;
  blurb: string;
  needs: string;
  gate: BuildingKind;
  gateLevel: number;
  cost: Cost;
};

export const STUDIES: Record<StudyKind, StudyDef> = {
  cistern: {
    label: "سقاية",
    blurb: "ماء القبيلة يزيد بمقدار الخُمس.",
    needs: "بعد حفر البئر",
    gate: "well",
    gateLevel: 1,
    cost: { ...EMPTY_COST, gold: 40, wood: 70, stone: 30, seconds: 22 },
  },
  fodder: {
    label: "علف",
    blurb: "طعام القبيلة يزيد بمقدار الخُمس.",
    needs: "بعد زرع المزرعة",
    gate: "farm",
    gateLevel: 1,
    cost: { ...EMPTY_COST, gold: 40, wood: 50, water: 40, seconds: 22 },
  },
  scouts: {
    label: "طلائع",
    blurb: "المسير أقصر بخُمس الوقت.",
    needs: "بعد بناء الثكنة",
    gate: "barracks",
    gateLevel: 1,
    cost: { ...EMPTY_COST, gold: 80, food: 50, wood: 40, seconds: 26 },
  },
  rampart: {
    label: "متراس",
    blurb: "دفاع الخيمة أثقل بمقدار النصف.",
    needs: "بعد تطوير خيمة الشيخ",
    gate: "tent",
    gateLevel: 2,
    cost: { ...EMPTY_COST, gold: 90, wood: 80, stone: 120, seconds: 30 },
  },
};

export function studyOpen(levels: Record<BuildingKind, number>, kind: StudyKind) {
  const def = STUDIES[kind];
  return (levels[def.gate] ?? 0) >= def.gateLevel;
}

export function emptyStudyFlags(): StudyFlags {
  return { cistern: false, fodder: false, scouts: false, rampart: false };
}

export function applyStudies<T extends { water: number; food: number }>(
  rates: T,
  flags: Pick<StudyFlags, "cistern" | "fodder">,
): T {
  return {
    ...rates,
    water: flags.cistern ? Math.round(rates.water * 1.2) : rates.water,
    food: flags.fodder ? Math.round(rates.food * 1.2) : rates.food,
  };
}

export function defenseOf(tentLevel: number, rampart: boolean) {
  const base = wallDefense(tentLevel);
  return rampart ? Math.round(base * 1.5) : base;
}

export function pacedSeconds(dist: number, scouts: boolean) {
  const base = marchSeconds(dist);
  if (!scouts) return base;
  return Math.max(6, Math.round(base * 0.8));
}

export const SCOUT_GOLD = 20;
export const SCOUT_HOLD_MIN = 4;

export function scoutSeconds(dist: number, fast: boolean) {
  return Math.max(6, Math.round(pacedSeconds(dist, fast) * 0.7));
}

export function roughSize(n: number) {
  if (n <= 0) return "لا أحد";
  if (n < 6) return "قلة";
  if (n < 16) return "نحو عشرة";
  if (n < 40) return "عشرات";
  return "جمع كثير";
}

export function lootHint(stock: { water: number; food: number; gold: number; wood: number; stone: number }) {
  const total = stock.water + stock.food + stock.gold + stock.wood + stock.stone;
  if (total < 90) return "غنيمة خفيفة";
  if (total < 240) return "غنيمة متوسطة";
  return "غنيمة سمينة";
}

export function expandCost(nextRadius: number): Cost {
  const n = nextRadius;
  return {
    water: 0,
    food: 0,
    wood: 90 * n * n,
    stone: 70 * n * n,
    gold: 45 * n * n,
    people: 0,
    seconds: 18 * n,
  };
}

export function peaceExtendCost(extendsSoFar: number): Cost {
  return {
    ...EMPTY_COST,
    gold: 80 * (extendsSoFar + 1),
    seconds: 0,
  };
}

export function distance(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function chebyshev(ax: number, ay: number, bx: number, by: number) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function marchSeconds(dist: number) {
  return Math.max(MARCH_MIN_SEC, Math.round(dist * MARCH_SEC_PER_TILE));
}

export function moveQuote(dist: number, movesDone: number) {
  const base = 50 + Math.round(dist * 12);
  const gold = movesDone === 0 ? Math.max(20, Math.round(base * 0.45)) : base;
  return { gold, seconds: 12 + Math.round(dist * 4) };
}

export function trainQuote(kind: TroopKind, qty: number, barracksLevel: number): Cost {
  const u = TRAIN[kind];
  const level = Math.max(1, barracksLevel);
  return {
    water: u.water * qty,
    food: u.food * qty,
    gold: u.gold * qty,
    wood: u.wood * qty,
    stone: u.stone * qty,
    people: u.people * qty,
    seconds: Math.max(8, Math.round((u.seconds * qty) / level)),
  };
}

export function carryOf(infantry: number, cavalry: number) {
  return infantry * TRAIN.infantry.carry + cavalry * TRAIN.cavalry.carry;
}

export function armyPower(infantry: number, cavalry: number) {
  return infantry * TRAIN.infantry.atk + cavalry * TRAIN.cavalry.atk;
}

export function powerBand(power: number) {
  if (power < 140) return "ضعيفة";
  if (power < 420) return "متوسطة";
  return "قوية";
}

export type BattleSide = { infantry: number; cavalry: number };

export type BattleResult = {
  attackerWins: boolean;
  atkInfLoss: number;
  atkCavLoss: number;
  defInfLoss: number;
  defCavLoss: number;
  atkPower: number;
  defPower: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function resolveBattle(
  atk: BattleSide,
  def: BattleSide,
  wall: number,
  rng: () => number = Math.random,
): BattleResult {
  const atkRaw = atk.infantry * TRAIN.infantry.atk + atk.cavalry * TRAIN.cavalry.atk;
  const defRaw = def.infantry * TRAIN.infantry.def + def.cavalry * TRAIN.cavalry.def + wall;
  const a = atkRaw * (0.9 + rng() * 0.2);
  const d = defRaw * (0.9 + rng() * 0.2);
  const attackerWins = atkRaw > 0 && a >= d;
  const atkFrac = atkRaw <= 0 ? 1 : clamp((d / Math.max(a, 1)) * 0.62, 0.05, 0.92);
  const defFrac = defRaw <= 0 ? 1 : clamp((a / Math.max(d, 1)) * 0.66, 0.05, attackerWins ? 0.9 : 0.7);
  const loss = (n: number, frac: number) => Math.min(n, Math.round(n * frac));
  return {
    attackerWins,
    atkInfLoss: loss(atk.infantry, atkFrac),
    atkCavLoss: loss(atk.cavalry, atkFrac),
    defInfLoss: loss(def.infantry, defFrac),
    defCavLoss: loss(def.cavalry, defFrac),
    atkPower: Math.round(a),
    defPower: Math.round(d),
  };
}

export type Stock = { water: number; food: number; gold: number; wood: number; stone: number };

/** Report line for income lost to a full storehouse; empty when nothing spilled. */
/**
 * What a raid actually moves, per good: the loot, but never more than the
 * target holds nor more than the raider's free room. Nothing is destroyed:
 * `moved` leaves the target and reaches the raider; `left` stays with the target.
 */
export function lootTransfer(want: Stock, have: Stock, room: Stock): { moved: Stock; left: Stock } {
  const moved: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
  const left: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
  for (const key of Object.keys(moved) as (keyof Stock)[]) {
    const wanted = Math.max(0, Math.min(Math.floor(want[key]), Math.floor(have[key])));
    moved[key] = Math.min(wanted, Math.max(0, Math.floor(room[key])));
    left[key] = wanted - moved[key];
  }
  return { moved, left };
}

/** What stays with a den or a صعلوك after a raid moved `moved` out of `hoard` (never negative). */
export function hoardLeft(hoard: Stock, moved: Stock): Stock {
  const left: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
  for (const key of Object.keys(left) as (keyof Stock)[]) {
    left[key] = Math.max(0, Math.floor(hoard[key]) - Math.max(0, Math.floor(moved[key])));
  }
  return left;
}

export function hasGoods(stock: Stock) {
  return (Object.keys(stock) as (keyof Stock)[]).some((key) => stock[key] > 0);
}

/**
 * Share of a hoard a winning raid may carry off: LOOT_SHARE while guards
 * stand, everything (that fits) once the den or the صعلوك has none left, so a
 * guardless den is emptied and then removed (QA N3).
 */
export function hoardShare(guards: number) {
  return guards > 0 ? LOOT_SHARE : 1;
}

/** QA N3: a beaten den / صعلوك is removed only when it has neither guards nor goods left. */
export function keepsHoard(guards: number, left: Stock) {
  return guards > 0 || hasGoods(left);
}

/** Report line for loot that did not fit the raider's stores and so stayed with the target. */
export function keptNote(left: Stock, holder: string) {
  const bits: string[] = [];
  if (left.food) bits.push(`${left.food} طعام`);
  if (left.wood) bits.push(`${left.wood} خشب`);
  if (left.stone) bits.push(`${left.stone} حجر`);
  if (left.water) bits.push(`${left.water} ماء`);
  const parts: string[] = [];
  if (bits.length) parts.push(`${bits.join("، ")} لضيق المخزن`);
  if (left.gold) parts.push(`${left.gold} ذهب لضيق بيت المال`);
  return parts.length ? `بقي ${holder} ${parts.join("، و")}.` : "";
}

/** Fill `carry` from `stock`, food first, taking at most `share` of each good. */
export function takeLoot(stock: Stock, carry: number, share = LOOT_SHARE): Stock {
  const loot: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
  let room = Math.max(0, carry);
  const order: (keyof Stock)[] = ["food", "gold", "wood", "stone", "water"];
  for (const key of order) {
    const want = Math.floor(stock[key] * share);
    const got = Math.min(want, room, stock[key]);
    loot[key] = got;
    room -= got;
  }
  return loot;
}

export function inBounds(x: number, y: number) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < WORLD && y < WORLD;
}

export function banditKit(tier: number) {
  if (tier <= 1) {
    return {
      tier: 1,
      label: "عصابة صغيرة",
      infantry: 14,
      cavalry: 0,
      gold: 70,
      food: 150,
      water: 40,
      wood: 60,
      stone: 30,
    };
  }
  if (tier === 2) {
    return {
      tier: 2,
      label: "قطاع طرق",
      infantry: 18,
      cavalry: 5,
      gold: 130,
      food: 190,
      water: 70,
      wood: 100,
      stone: 80,
    };
  }
  return {
    tier: 3,
    label: "قطّاع جريئون",
    infantry: 14,
    cavalry: 11,
    gold: 210,
    food: 240,
    water: 90,
    wood: 140,
    stone: 110,
  };
}

export function banditLabel(tier: number) {
  return banditKit(tier).label;
}

export const SUGGESTED_NAMES = ["كنانة", "الأزد", "همدان", "طيء", "مذحج", "كندة", "غسان", "قضاعة"];

export const SHEIKH_TRAITS = ["guard", "water", "rider", "raid"] as const;
export type SheikhTrait = (typeof SHEIKH_TRAITS)[number];

export const SHEIKH_NAMES = ["حارث", "قيس", "أوس", "زيد", "مهلهل", "عامر", "سعد", "مالك"];

export const TRAITS: Record<SheikhTrait, { label: string; blurb: string }> = {
  guard: { label: "حارس", blurb: "دفاع المضارب يثقل كلما علا صيت الشيخ." },
  water: { label: "سقّاء", blurb: "ماء القبيلة يغزر كلما علا صيت الشيخ." },
  rider: { label: "فارس", blurb: "المسير يقصر كلما علا صيت الشيخ." },
  raid: { label: "غنّام", blurb: "الغنائم توفر كلما علا صيت الشيخ." },
};

export function isSheikhTrait(value: string): value is SheikhTrait {
  return (SHEIKH_TRAITS as readonly string[]).includes(value);
}

export function traitFactor(trait: SheikhTrait, renown: number) {
  const step = 0.03 * Math.max(0, Math.min(8, renown));
  if (trait === "rider") return Math.max(0.72, 0.9 - step);
  return 1.1 + step;
}

export function traitLine(trait: SheikhTrait, renown: number) {
  const pct = Math.round(Math.abs(traitFactor(trait, renown) - 1) * 100);
  if (trait === "rider") return `المسير أقصر بنحو ${pct}٪.`;
  if (trait === "water") return `ماء القبيلة أغزر بنحو ${pct}٪.`;
  if (trait === "guard") return `دفاع المضارب أثقل بنحو ${pct}٪.`;
  return `الغنائم أوفر بنحو ${pct}٪.`;
}

export const LINEAGES = ["aws", "ghassan", "lakhm", "azd", "khuzaa"] as const;
export type Lineage = (typeof LINEAGES)[number];

export const LINEAGE: Record<
  Lineage,
  {
    name: string;
    poet: string;
    /** "jahili" = documented pre-Islamic poet (lineage, era and sources in docs/poets.md); "fictional" = invented character. */
    poetKind: "jahili" | "fictional";
    poetNote: string;
    blurb: string;
    gift: string;
    edge: "water" | "market" | "build" | "pasture" | "haven";
    trait: SheikhTrait;
  }
> = {
  aws: {
    name: "الأوس",
    poet: "أحيحة بن الجلاح",
    poetKind: "jahili",
    poetNote: "سيد الأوس في الجاهلية",
    blurb: "أهل يثرب، سادة النخيل والماء.",
    gift: "ماء القبيلة يغزر كلما علا الصيت.",
    edge: "water",
    trait: "water",
  },
  ghassan: {
    name: "غسان",
    poet: "النابغة الذبياني",
    poetKind: "jahili",
    poetNote: "شاعر بلاطهم، ذبياني النسب",
    blurb: "ملوك الشام، وبابهم السوق.",
    gift: "البدل يعيد ٤ بدل ٣ في كل دفعة.",
    edge: "market",
    trait: "raid",
  },
  lakhm: {
    name: "لخم",
    poet: "عدي بن زيد العبادي",
    poetKind: "jahili",
    poetNote: "شاعر بلاط الحيرة، تميمي النسب",
    blurb: "ملوك الحيرة، وحكمتهم في البناء.",
    gift: "وقت الرفع والتدريب والدراسة أقصر بخمس.",
    edge: "build",
    trait: "rider",
  },
  azd: {
    name: "أزد عمان",
    poet: "راوي الأفلاج",
    poetKind: "fictional",
    poetNote: "شخصية متخيَّلة",
    blurb: "أهل الأفلاج، وغلة الحمى أغزر.",
    gift: "مراعي السلسلة أغزر بربع.",
    edge: "pasture",
    trait: "rider",
  },
  khuzaa: {
    name: "خزاعة",
    poet: "حادي تهامة",
    poetKind: "fictional",
    poetNote: "شخصية متخيَّلة",
    blurb: "أهل تهامة، وحمى لا يُداس مجاناً.",
    gift: "دفاع المضارب أثقل، ومن يُسكت مرعاهم يخسر صيتاً.",
    edge: "haven",
    trait: "guard",
  },
};

/** "شاعرها X (note)" as shown to the player. */
export function poetLine(line: { poet: string; poetNote: string }) {
  return `${line.poet} (${line.poetNote})`;
}

export function isLineage(value: string): value is Lineage {
  return (LINEAGES as readonly string[]).includes(value);
}

export function lineageBy(value: unknown) {
  const id = String(value ?? "");
  return isLineage(id) ? LINEAGE[id] : null;
}

export function playedTrait(lineage: unknown, stored: SheikhTrait): SheikhTrait | null {
  const line = lineageBy(lineage);
  if (!line) return stored;
  if (line.edge === "water") return "water";
  if (line.edge === "haven") return "guard";
  return null;
}

export function workSeconds(lineage: unknown, seconds: number) {
  if (lineageBy(lineage)?.edge === "build") return Math.max(4, Math.round(seconds * 0.8));
  return seconds;
}

export function pastureBoost(lineage: unknown, amount: number) {
  if (lineageBy(lineage)?.edge !== "pasture" || amount <= 0) return amount;
  return Math.round(amount * 1.25);
}

export function barterTake(lineage: unknown, lots: number) {
  return lots * (lineageBy(lineage)?.edge === "market" ? BARTER_GET + 1 : BARTER_GET);
}

export function clockOf(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const hour = read("hour");
  const secOfDay = hour * 3600 + read("minute") * 60 + read("second");
  const night = hour >= 18 || hour < 6;
  const next = night ? (hour >= 18 ? 30 * 3600 : 6 * 3600) : 18 * 3600;
  return { night, until: now + (next - secOfDay) * 1000 };
}

export function isNight(now: number) {
  return clockOf(now).night;
}

export function paceOf(dist: number, fast: boolean, trait: SheikhTrait, renown: number) {
  const base = pacedSeconds(dist, fast);
  if (trait !== "rider") return base;
  return Math.max(6, Math.round(base * traitFactor("rider", renown)));
}

export const SAALIK_MAX = 5;

export const SAALIK_BANDS = [
  { name: "ابن الليل", line: "لا قبيلة تظله، وسيفه للإجارة." },
  { name: "راكب الريح", line: "يلحق بمن يدفع، ويرحل إن ضاق به المكان." },
  { name: "أبو الشرى", line: "يعرف شعاب الوادي أكثر من أهلها." },
  { name: "ذؤابة", line: "فرسان قلائل، وولاء لمن يطعمهم." },
  { name: "الخليع", line: "خرج من حمى قومه، ويبحث عن حمى آخر." },
] as const;

export function saalikOffer(index: number) {
  const band = SAALIK_BANDS[Math.abs(index) % SAALIK_BANDS.length]!;
  const n = Math.abs(index);
  return {
    name: band.name,
    line: band.line,
    cavalry: 4 + (n % 3) * 2,
    gold: 45 + (n % 4) * 15,
    food: 24 + (n % 3) * 12,
  };
}

export const GOODS = ["water", "food", "gold", "wood", "stone"] as const;
export type Good = (typeof GOODS)[number];

export function isGood(value: string): value is Good {
  return (GOODS as readonly string[]).includes(value);
}

export const BARTER_GIVE = 5;
export const BARTER_GET = 3;
export const BARTER_MAX_LOTS = 40;

export const OATH_KINDS = ["well", "host", "scout"] as const;
export type OathKind = (typeof OATH_KINDS)[number];

export const OATHS: Record<OathKind, { title: string; detail: string; reward: string }> = {
  well: { title: "احفر البئر", detail: "بئر من المستوى الأول.", reward: "٦٠ ذهب" },
  host: { title: "استضف فرساناً", detail: "ثمانية فرسان في المضارب، تدريباً أو بيعة.", reward: "٥٠ طعام" },
  scout: { title: "ابعث طليعة", detail: "طليعة خرجت أو عادت. لا تُسقط الدرع.", reward: "٤٠ ذهب" },
};

export function isOathKind(value: string): value is OathKind {
  return (OATH_KINDS as readonly string[]).includes(value);
}

export const GUIDE_KINDS = ["camp", "pasture", "well", "farm", "scout", "saalik", "market"] as const;
export type GuideKind = (typeof GUIDE_KINDS)[number];

export const GUIDE_REWARD: Record<GuideKind, { gold: number; food: number; wood: number; stone: number; label: string }> = {
  camp: { gold: 20, food: 0, wood: 0, stone: 0, label: "٢٠ ذهب" },
  pasture: { gold: 20, food: 30, wood: 0, stone: 0, label: "٢٠ ذهب و٣٠ طعام" },
  well: { gold: 40, food: 0, wood: 0, stone: 0, label: "٤٠ ذهب" },
  farm: { gold: 0, food: 50, wood: 0, stone: 0, label: "٥٠ طعام" },
  scout: { gold: 25, food: 0, wood: 0, stone: 0, label: "٢٥ ذهب" },
  saalik: { gold: 0, food: 40, wood: 0, stone: 0, label: "٤٠ طعام" },
  market: { gold: 15, food: 0, wood: 40, stone: 0, label: "١٥ ذهب و٤٠ خشب" },
};

export function isGuideKind(value: string): value is GuideKind {
  return (GUIDE_KINDS as readonly string[]).includes(value);
}

export const DEFERRED = [
  "الشعراء والرواة",
  "الصقور والاستطلاع المتقدم",
  "التاجر والقوافل بين القبائل",
  "الولاء المعقّد",
  "فرض الحماية على قبيلة أخرى",
  "الوزير الذكي",
  "التحالفات",
  "الرسوم المفصّلة",
];

/** Thousandths of a unit carried between ticks, so slow rates and frequent polls still add up. */
export const BANK_SCALE = 1000;

/**
 * Grow one good for `ms` milliseconds at `ratePerMin`, keeping the fractional
 * remainder in `bank` (thousandths). At the cap the bank is cleared.
 */
export function accrueGood(stock: number, bank: number, ratePerMin: number, ms: number, cap: number) {
  const safeBank = Number.isFinite(bank) ? Math.max(0, Math.floor(bank)) : 0;
  if (stock >= cap) return { stock, bank: 0 };
  if (!(ratePerMin > 0) || !(ms > 0)) return { stock, bank: safeBank };
  const total = safeBank + Math.floor((ratePerMin * ms) / 60);
  const gain = Math.floor(total / BANK_SCALE);
  const next = stock + gain;
  if (next >= cap) return { stock: cap, bank: 0 };
  return { stock: next, bank: total - gain * BANK_SCALE };
}

/** People growth: one person per `growMs` while food is above the gate, remainder kept in `bank` (ms). */
export function growPeople(people: number, bank: number, food: number, ms: number, cap: number, growMs: number, foodGate: number) {
  if (!(food > foodGate) || people >= cap || !(ms > 0)) return { people, bank };
  const total = bank + ms;
  return { people: Math.min(cap, people + Math.floor(total / growMs)), bank: total % growMs };
}

/** A whole number from untrusted input; anything not finite becomes -1 so range checks reject it. */
export function whole(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) ? Math.floor(n) : -1;
}
