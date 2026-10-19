import type { BuildingKind, FieldGood, GuideKind, OathKind, SheikhTrait, StudyKind, TroopKind } from "./balance";
import type { PastureGood, PastureReason } from "./pasture";

export type Rates = {
  water: number;
  food: number;
  gold: number;
  wood: number;
  stone: number;
};

export type BuildingView = {
  kind: BuildingKind;
  level: number;
  upgradeUntil: number | null;
};

export type FieldView = {
  slot: number;
  good: FieldGood;
  level: number;
  upgradeUntil: number | null;
};

export type StudyView = {
  kind: StudyKind;
  done: boolean;
  finishAt: number | null;
};

export type YouState = {
  name: string;
  x: number;
  y: number;
  water: number;
  food: number;
  gold: number;
  wood: number;
  stone: number;
  people: number;
  peopleCap: number;
  armyCap: number;
  infantry: number;
  cavalry: number;
  sanctuary: number;
  peaceUntil: number | null;
  attacked: boolean;
  peaceExtends: number;
  movesDone: number;
  expandUntil: number | null;
  move: { x: number; y: number; until: number } | null;
  buildings: BuildingView[];
  fields: FieldView[];
  training: { kind: TroopKind; qty: number; finishAt: number } | null;
  rates: Rates;
  storageCap: number;
  outbound: number;
  studies: StudyView[];
  sheikh: string;
  trait: SheikhTrait;
  lineage: string;
  poet: string;
  renown: number;
  pacts: number;
  oaths: OathView[];
  guide: GuideKind[];
  trades: number;
  chain: ChainView;
};

export type ChainView = {
  limit: number;
  owned: number;
  live: number;
  water: number;
  food: number;
  wood: number;
  stone: number;
  claim: { x: number; y: number; until: number } | null;
};

export type PublicPasture = {
  x: number;
  y: number;
  own: boolean;
  foreign: boolean;
  dispute: boolean;
  silent: boolean;
  bridge: boolean;
  good: PastureGood | null;
  rate: number;
  reason: PastureReason;
};

export type OathView = {
  kind: OathKind;
  done: boolean;
  claimed: boolean;
};

export type PublicCamp = {
  id: string;
  name: string;
  x: number;
  y: number;
  sanctuary: number;
  tent: number;
  peace: boolean;
  band: string;
  own: boolean;
  moving: boolean;
  sheikh: string;
  people: string;
  structures: number;
};

export type PublicBandit = {
  id: number;
  x: number;
  y: number;
  tier: number;
  label: string;
  band: string;
};

export type PublicSaalik = {
  id: number;
  x: number;
  y: number;
  name: string;
  line: string;
  cavalry: number;
  gold: number;
  food: number;
};

export type PublicMarch = {
  id: number;
  role: "out" | "in" | "watch";
  phase: "march" | "return";
  purpose: "attack" | "scout" | "spoil";
  attackerName: string;
  targetName: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  departAt: number;
  arriveAt: number;
  infantry: number | null;
  cavalry: number | null;
};

export type PublicClash = {
  id: number;
  x: number;
  y: number;
  attacker: string;
  defender: string;
  attackerWins: boolean;
  summary: string;
  createdAt: number;
};

export type IntelView = {
  targetKind: "player" | "bandit";
  targetId: string;
  detail: string;
  until: number;
};

export type ReportView = {
  id: number;
  kind: string;
  title: string;
  body: string;
  victory: boolean | null;
  createdAt: number;
  seen: boolean;
};

export type WorldSnapshot = {
  serverNow: number;
  you: YouState | null;
  camps: PublicCamp[];
  bandits: PublicBandit[];
  saalik: PublicSaalik[];
  marches: PublicMarch[];
  clashes: PublicClash[];
  intel: IntelView[];
  reports: ReportView[];
  pastures: PublicPasture[];
  unread: number;
  playerCount: number;
  clock: { night: boolean; until: number };
};

export type GameResult = { ok: true; world: WorldSnapshot } | { ok: false; error: string };
