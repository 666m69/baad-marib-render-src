import { GUIDE_REWARD, TRAITS } from "./balance";
import type { GuideKind } from "./balance";
import type { WorldSnapshot } from "./types";

export type CoachTab = "map" | "camp" | "army" | "reports";

export type CoachLesson = {
  id: GuideKind | "found" | "ready";
  step: number;
  total: number;
  title: string;
  body: string;
  reward: string | null;
  go: CoachTab | null;
  goLabel: string | null;
  ack: boolean;
  ackOnGo: boolean;
  claim: boolean;
  focus: "bandit" | "saalik" | "home" | null;
};

const TOTAL = 7;

function wellOf(world: WorldSnapshot) {
  const row = world.you?.buildings.find((b) => b.kind === "well");
  return { level: row?.level ?? 0, busy: row?.upgradeUntil != null };
}

function fieldTop(world: WorldSnapshot, good: "water" | "food") {
  const rows = world.you?.fields?.filter((field) => field.good === good) ?? [];
  return {
    level: rows.reduce((max, field) => Math.max(max, field.level), 0),
    busy: rows.some((field) => field.upgradeUntil != null),
  };
}

function didScout(world: WorldSnapshot) {
  const you = world.you;
  if (!you) return false;
  return (
    world.marches.some((m) => m.purpose === "scout" && m.role === "out") ||
    world.reports.some((r) => r.kind === "scout") ||
    you.oaths.some((o) => o.kind === "scout" && (o.done || o.claimed))
  );
}

function lesson(
  partial: Omit<CoachLesson, "reward" | "claim" | "ackOnGo"> & { id: GuideKind; ready: boolean; claimed: boolean; ackOnGo?: boolean },
): CoachLesson & { done: boolean; ready: boolean; claimed: boolean } {
  const reward = GUIDE_REWARD[partial.id].label;
  const claim = partial.ready && !partial.claimed;
  return {
    ...partial,
    ackOnGo: partial.ackOnGo ?? false,
    reward,
    claim,
    goLabel: claim ? `اقبض ${reward}` : partial.goLabel,
    ack: claim ? false : partial.ack,
    done: partial.claimed,
  };
}

export function coachLesson(world: WorldSnapshot, acked: readonly string[]): CoachLesson {
  const you = world.you;
  if (!you) {
    return {
      id: "found",
      step: 1,
      total: TOTAL,
      title: "نصب المضارب",
      body: "سمِّ القبيلة واختر أصلها. شاعرها يلازم أخبارها، وميزتها تُحسب. بعدها أمشي معك خطوة خطوة، ولكل خطوة هدية تقبضها متى أنجزت.",
      reward: null,
      go: null,
      goLabel: null,
      ack: false,
      ackOnGo: false,
      claim: false,
      focus: null,
    };
  }

  const seen = new Set(acked);
  const claimed = new Set(you.guide ?? []);
  const well = wellOf(world);
  const spring = fieldTop(world, "water");
  const palms = fieldTop(world, "food");
  const host = you.oaths.find((o) => o.kind === "host");
  const trait = TRAITS[you.trait];

  const lessons = [
    lesson({
      id: "camp",
      step: 1,
      total: TOTAL,
      title: "خريطة المضارب",
      body: `ثماني عشرة حقلاً حول المضارب: نخيل وعيون وأحطاب ومقالع. كل موضع له مستوى وإنتاج بالساعة. شيخها ${you.sheikh}${you.poet ? `، وشاعرها ${you.poet}` : ` ${trait.label}`}. اضغط حقلاً لرفعه.`,
      go: "camp",
      goLabel: "إلى خريطة المضارب",
      ack: false,
      ackOnGo: true,
      focus: null,
      ready: seen.has("camp") || well.level >= 1,
      claimed: claimed.has("camp"),
    }),
    lesson({
      id: "pasture",
      step: 2,
      total: TOTAL,
      title: "سلسلتك في الوادي",
      body: "الحمى ليس دائرة. هو مربع ملاصق لديرتك، ثم مربع يلتصق به. أول مرعى معك. اضغطه على الخريطة: الذهب يعمل، والمتنازع يُسكت.",
      go: "map",
      goLabel: "أرني سلسلتي",
      ack: false,
      ackOnGo: true,
      focus: "home",
      ready: seen.has("pasture") || (you.chain?.owned ?? 0) >= 2,
      claimed: claimed.has("pasture"),
    }),
    lesson({
      id: "well",
      step: 3,
      total: TOTAL,
      title: spring.busy ? "العين تُرفع" : "ارفع عين ماء",
      body: spring.busy
        ? "الرفع جارٍ. طابور واحد في القرية، وحين تكتمل العين اقبض المكافأة."
        : "في الحقول اضغط عين ماء ثم ارفعها. إنتاج الساعة يزيد مع المستوى. البئر داخل المضارب يزيد كل العيون.",
      go: "camp",
      goLabel: "إلى العيون",
      ack: false,
      focus: null,
      ready: spring.level >= 2 || well.level >= 1,
      claimed: claimed.has("well"),
    }),
    lesson({
      id: "farm",
      step: 4,
      total: TOTAL,
      title: palms.busy ? "النخيل يُرفع" : "ارفع نخيلاً",
      body: palms.busy
        ? "النخيل يُرفع. حين يكتمل يصير الطعام مكافأتك."
        : "اضغط حقلاً من النخيل وارفعه مستوى. من دون طعام يتوقف نمو السكان. المزرعة في المضارب تزيد كل النخيل.",
      go: "camp",
      goLabel: "إلى النخيل",
      ack: false,
      focus: null,
      ready: palms.level >= 2 || (you.buildings.find((b) => b.kind === "farm")?.level ?? 0) >= 1,
      claimed: claimed.has("farm"),
    }),
    lesson({
      id: "scout",
      step: 5,
      total: TOTAL,
      title: "ابعث طليعة",
      body: "من خريطة الوادي اضغط العصابة ثم أرسل طليعة. ترى قوتها، ودرعك لا يسقط.",
      go: "map",
      goLabel: "أرني عصابة",
      ack: false,
      focus: "bandit",
      ready: didScout(world),
      claimed: claimed.has("scout"),
    }),
    lesson({
      id: "saalik",
      step: 6,
      total: TOTAL,
      title: "بايع صعلوكاً",
      body: "حرف ص على الوادي. بايع فرسانه فيدخلون جيشك والدرع قائم. بعدها، من المغرب إلى الفجر، غارتك بلا اسم.",
      go: "map",
      goLabel: "أرني صعلوكاً",
      ack: false,
      focus: "saalik",
      ready: you.cavalry >= 8 || Boolean(host?.claimed) || Boolean(host?.done),
      claimed: claimed.has("saalik"),
    }),
    lesson({
      id: "market",
      step: 7,
      total: TOTAL,
      title: "بدّل في السوق",
      body: "تحت خريطة المضارب سوق. كل ٥ من مورد فائض تعطيك ٣ من مورد تحتاجه، وغسان تعطيه ٤. بدّل مرة واحدة.",
      go: "camp",
      goLabel: "إلى السوق",
      ack: false,
      focus: null,
      ready: (you.trades ?? 0) >= 1,
      claimed: claimed.has("market"),
    }),
  ];

  const current = lessons.find((item) => !item.done);
  if (current) {
    const { done: _done, ready: _ready, claimed: _claimed, ...rest } = current;
    return rest;
  }
  return {
    id: "ready",
    step: TOTAL,
    total: TOTAL,
    title: "الوادي لك",
    body: "قبضت هدايا التعليم السبع. أخفِني وتصفّح الوادي وحدك، وعد إليّ من زر المرشد متى شئت.",
    reward: null,
    go: null,
    goLabel: null,
    ack: false,
    ackOnGo: false,
    claim: false,
    focus: null,
  };
}
