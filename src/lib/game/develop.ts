import {
  BUILDINGS,
  capState,
  goldCap,
  applyStudies,
  armyCap,
  peopleCap,
  ratesPerMin,
  storageCap,
  trainQuote,
  wallDefense,
  type BuildingKind,
} from "./balance";
import { fmt } from "./format";
import type { YouState } from "./types";

const RANKS = [
  { min: 0, name: "مخيم عابر", note: "الماء أول ما يُحفَر." },
  { min: 4, name: "مضارب ناشئة", note: "البئر والمزرعة يمسكان الناس." },
  { min: 10, name: "حيّ قائم", note: "الورشة والثكنة تفتحان الطريق." },
  { min: 18, name: "عزوة", note: "الحمى يتسع والجيش يثقل." },
  { min: 28, name: "سيادة الوادي", note: "الخيمة عالية والدفاع متين." },
] as const;

export type YieldLine = { label: string; now: string; next: string };

export type StepKind = BuildingKind | "expand" | "done";

export type DevelopStep = {
  title: string;
  detail: string;
  kind: StepKind;
};

export function levelMap(you: YouState): Record<BuildingKind, number> {
  const levels: Record<BuildingKind, number> = {
    tent: 0,
    well: 0,
    farm: 0,
    workshop: 0,
    barracks: 0,
    storehouse: 0,
  };
  for (const building of you.buildings) levels[building.kind] = building.level;
  return levels;
}

export function developScore(you: YouState) {
  const levels = levelMap(you);
  return (
    levels.tent +
    levels.well +
    levels.farm +
    levels.workshop +
    levels.barracks +
    levels.storehouse +
    you.studies.filter((study) => study.done).length * 2 +
    you.renown +
    (you.chain?.live ?? 0) +
    Math.floor((you.fields ?? []).reduce((sum, field) => sum + field.level, 0) / 2)
  );
}

export function rankOf(score: number) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (score >= RANKS[i].min) index = i;
  }
  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const span = next ? next.min - current.min : 1;
  const progress = next ? Math.min(span, score - current.min) : span;
  return { current, next, span, progress, score };
}

function studyFlags(you: YouState) {
  return {
    cistern: you.studies.some((study) => study.kind === "cistern" && study.done),
    fodder: you.studies.some((study) => study.kind === "fodder" && study.done),
  };
}

function rateLine(label: string, now: number, next: number): YieldLine | null {
  if (now === next) return null;
  return { label, now: `${fmt(now)} / د`, next: `${fmt(next)} / د` };
}

export function upgradeYield(you: YouState, kind: BuildingKind): YieldLine[] {
  const levels = levelMap(you);
  const current = levels[kind];
  const raised = { ...levels, [kind]: current + 1 };
  const fields = (you.fields ?? []).map((field) => ({ good: field.good, level: field.level }));
  const before = applyStudies(ratesPerMin(levels, you.sanctuary, fields), studyFlags(you));
  const after = applyStudies(ratesPerMin(raised, you.sanctuary, fields), studyFlags(you));
  const lines: YieldLine[] = [];
  const push = (line: YieldLine | null) => {
    if (line) lines.push(line);
  };

  if (kind === "well") push(rateLine("الماء", before.water, after.water));
  if (kind === "farm") push(rateLine("الطعام", before.food, after.food));
  if (kind === "workshop") {
    push(rateLine("الخشب", before.wood, after.wood));
    push(rateLine("الحجر", before.stone, after.stone));
  }
  if (kind === "tent") {
    push(rateLine("الذهب", before.gold, after.gold));
    lines.push({ label: "حد السكان", now: fmt(peopleCap(current)), next: fmt(peopleCap(current + 1)) });
    lines.push({ label: "بيت المال", now: fmt(goldCap(current)), next: fmt(goldCap(current + 1)) });
    lines.push({ label: "دفاع الخيمة", now: fmt(wallDefense(current)), next: fmt(wallDefense(current + 1)) });
    lines.push({ label: "حد الجيش", now: fmt(armyCap(current)), next: fmt(armyCap(current + 1)) });
  }
  if (kind === "storehouse") {
    lines.push({ label: "سعة المخزن", now: fmt(storageCap(current)), next: fmt(storageCap(current + 1)) });
  }
  if (kind === "barracks") {
    const closed = current < 1;
    const seconds = trainQuote("infantry", 5, current + 1).seconds;
    lines.push({
      label: "خمسة مشاة",
      now: closed ? "مغلق" : `${fmt(trainQuote("infantry", 5, current).seconds)} ث`,
      next: `${fmt(seconds)} ث`,
    });
  }
  return lines;
}

/** True when any of water, food, wood or stone is at 80% of the storehouse cap or more. */
export function storeNearFull(you: Pick<YouState, "water" | "food" | "wood" | "stone" | "storageCap">) {
  return (["water", "food", "wood", "stone"] as const).some((good) => capState(you[good], you.storageCap) !== "ok");
}

export function nextStep(you: YouState): DevelopStep {
  const levels = levelMap(you);
  if (storeNearFull(you) && levels.storehouse < BUILDINGS.storehouse.max) {
    return { title: "ارفع المخزن", detail: "المخزن قارب الامتلاء. ما زاد على سعته من الغلّة يضيع، والغنيمة التي لا تسعها تبقى عند أهلها.", kind: "storehouse" };
  }
  if (levels.well < 1) return { title: "احفر البئر", detail: "من دون ماء تجف المضارب قبل أي غارة.", kind: "well" };
  if (levels.farm < 1) return { title: "ازرع المزرعة", detail: "السكان يتوقفون إن هبط الطعام تحت أربعين.", kind: "farm" };
  if (levels.well < 2) return { title: "طوّر البئر", detail: "ماء أكثر يفتح باقي البناء.", kind: "well" };
  if (levels.storehouse < 1) return { title: "ابْنِ المخزن", detail: "الماء والطعام والخشب والحجر لا تُخزن فوق سعة المخزن.", kind: "storehouse" };
  if (levels.barracks < 1) return { title: "ابْنِ الثكنة", detail: "المشاة والفرسان لا يُدرَّبون إلا فيها.", kind: "barracks" };
  if (levels.workshop < 1) return { title: "ابْنِ الورشة", detail: "الخشب والحجر يغذّيان التوسيع والنقل.", kind: "workshop" };
  if (levels.farm < 2) return { title: "طوّر المزرعة", detail: "جيش أكبر يحتاج طعاماً أكثر.", kind: "farm" };
  if (levels.tent < 2) return { title: "ارفع خيمة الشيخ", detail: "ذهب أكثر، وسكان أكثر، ودفاع أثقل.", kind: "tent" };
  if (you.chain && you.chain.owned < you.chain.limit) {
    return { title: "ضم مربعاً من الخريطة", detail: "الحمى سلسلة ملاصقة، لا حلقة. الرمل درب، والمجرى والواحة والعشب والكثيب تنتج.", kind: "expand" };
  }
  if (levels.barracks < 2) return { title: "طوّر الثكنة", detail: "التدريب يصير أسرع.", kind: "barracks" };

  const order: BuildingKind[] = ["well", "farm", "workshop", "storehouse", "tent", "barracks"];
  const pick = order.filter((kind) => levels[kind] < BUILDINGS[kind].max).sort((a, b) => levels[a] - levels[b])[0];
  if (pick) {
    return { title: `طوّر ${BUILDINGS[pick].label}`, detail: BUILDINGS[pick].blurb, kind: pick };
  }
  if (you.chain && you.chain.owned < you.chain.limit) {
    return { title: "ضم مربعاً من الخريطة", detail: "ما زاد على حد الفرسان يُسكت الأبعد.", kind: "expand" };
  }
  return { title: "بلغت غاية التطوير", detail: "المضارب في أقصاها. بقي السيف والموقع.", kind: "done" };
}
