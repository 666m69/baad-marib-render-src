import { inBounds, type Cost } from "./balance";
import { terrainAt } from "./terrain";

export const SPOIL_HOLD_SEC = 45;

export type PastureGood = "water" | "food" | "wood" | "stone";

export type PastureReason = "live" | "dispute" | "cut" | "intruder" | "cap";

export const PASTURE_REASON: Record<PastureReason, string> = {
  live: "يعمل",
  dispute: "نزاع",
  cut: "الدرب مقطوع",
  intruder: "دخيل",
  cap: "خارج الحد",
};

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const TERRAIN_RANK = { oasis: 0, wadi: 1, scrub: 2, dune: 3, sand: 9 } as const;

export function cellKey(x: number, y: number) {
  return `${x}:${y}`;
}

export function pastureBase(x: number, y: number): { good: PastureGood | null; rate: number } {
  const terrain = terrainAt(x, y);
  if (terrain === "wadi") return { good: "water", rate: 3 };
  if (terrain === "oasis") return { good: "food", rate: 2 };
  if (terrain === "scrub") return { good: "wood", rate: 3 };
  if (terrain === "dune") return { good: "stone", rate: 2 };
  return { good: null, rate: 0 };
}

export function chainLimit(cavalry: number, renown: number) {
  return 1 + Math.floor(Math.max(0, cavalry) / 4) + Math.floor(Math.max(0, renown) / 4);
}

export function claimCost(steps: number): Cost {
  const n = Math.max(1, Math.floor(steps));
  return {
    water: 0,
    food: 36 * n,
    gold: 18 * n,
    wood: 0,
    stone: 0,
    people: 0,
    seconds: 18 * n,
  };
}

export type PastureClaim = { userId: string; x: number; y: number; at: number };
export type PastureAnchor = { userId: string; x: number; y: number; cavalry: number; renown: number };
export type PastureIntruder = { x: number; y: number; userId: string };

export type PastureState = {
  userId: string;
  x: number;
  y: number;
  at: number;
  good: PastureGood | null;
  rate: number;
  connected: boolean;
  sole: boolean;
  clear: boolean;
  held: boolean;
  producing: boolean;
  yield: number;
  reason: PastureReason;
  bridge: boolean;
};

function neighbors(x: number, y: number) {
  return DIRS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

function walk(start: { x: number; y: number }, open: Set<string>) {
  const dist = new Map<string, number>();
  const queue = [{ x: start.x, y: start.y, d: 0 }];
  const seen = new Set<string>([cellKey(start.x, start.y)]);
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (!cur) break;
    for (const next of neighbors(cur.x, cur.y)) {
      const key = cellKey(next.x, next.y);
      if (seen.has(key) || !open.has(key)) continue;
      seen.add(key);
      dist.set(key, cur.d + 1);
      queue.push({ x: next.x, y: next.y, d: cur.d + 1 });
    }
  }
  return dist;
}

export function evaluatePastures(
  anchors: PastureAnchor[],
  claims: PastureClaim[],
  intruders: PastureIntruder[],
): PastureState[] {
  const anchorAt = new Map(anchors.map((anchor) => [anchor.userId, anchor]));
  const ownersAt = new Map<string, number>();
  for (const claim of claims) {
    const anchor = anchorAt.get(claim.userId);
    if (anchor && anchor.x === claim.x && anchor.y === claim.y) continue;
    const key = cellKey(claim.x, claim.y);
    ownersAt.set(key, (ownersAt.get(key) ?? 0) + 1);
  }
  const intrudersByCell = new Map<string, Set<string>>();
  for (const intruder of intruders) {
    const key = cellKey(intruder.x, intruder.y);
    const bag = intrudersByCell.get(key) ?? new Set<string>();
    bag.add(intruder.userId);
    intrudersByCell.set(key, bag);
  }

  const byUser = new Map<string, PastureClaim[]>();
  for (const claim of claims) {
    const anchor = anchorAt.get(claim.userId);
    if (!anchor || (anchor.x === claim.x && anchor.y === claim.y)) continue;
    const list = byUser.get(claim.userId) ?? [];
    list.push(claim);
    byUser.set(claim.userId, list);
  }

  const states: PastureState[] = [];
  for (const anchor of anchors) {
    const mine = byUser.get(anchor.userId) ?? [];
    const allKeys = new Set(mine.map((claim) => cellKey(claim.x, claim.y)));
    const soleKeys = new Set(
      mine.filter((claim) => (ownersAt.get(cellKey(claim.x, claim.y)) ?? 0) === 1).map((claim) => cellKey(claim.x, claim.y)),
    );
    const dist = walk(anchor, allKeys);
    const connected = walk(anchor, soleKeys);
    const limit = chainLimit(anchor.cavalry, anchor.renown);
    const ranked = [...mine].sort((a, b) => {
      const da = dist.get(cellKey(a.x, a.y)) ?? 9999;
      const db = dist.get(cellKey(b.x, b.y)) ?? 9999;
      if (da !== db) return da - db;
      if (a.at !== b.at) return a.at - b.at;
      return cellKey(a.x, a.y).localeCompare(cellKey(b.x, b.y));
    });
    const held = new Set(ranked.slice(0, limit).map((claim) => cellKey(claim.x, claim.y)));
    for (const claim of mine) {
      const key = cellKey(claim.x, claim.y);
      const base = pastureBase(claim.x, claim.y);
      const sole = (ownersAt.get(key) ?? 0) === 1;
      const linked = connected.has(key);
      const present = intrudersByCell.get(key);
      const clear = !present || ![...present].some((id) => id !== anchor.userId);
      const inside = held.has(key);
      const producing = sole && linked && clear && inside;
      const reason: PastureReason = !sole ? "dispute" : !linked ? "cut" : !clear ? "intruder" : !inside ? "cap" : "live";
      states.push({
        userId: anchor.userId,
        x: claim.x,
        y: claim.y,
        at: claim.at,
        good: base.good,
        rate: base.rate,
        connected: linked,
        sole,
        clear,
        held: inside,
        producing,
        yield: producing ? base.rate : 0,
        reason,
        bridge: sole && linked,
      });
    }
  }
  return states;
}

export function bestPastureNeighbor(
  x: number,
  y: number,
  blocked: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  let best: { x: number; y: number; rank: number } | null = null;
  for (const next of neighbors(x, y)) {
    if (!inBounds(next.x, next.y) || blocked(next.x, next.y)) continue;
    const rank = TERRAIN_RANK[terrainAt(next.x, next.y)];
    if (rank >= 9) continue;
    if (!best || rank < best.rank) best = { x: next.x, y: next.y, rank };
  }
  return best ? { x: best.x, y: best.y } : null;
}

export function claimSteps(
  dirah: { x: number; y: number },
  bridges: { x: number; y: number }[],
  target: { x: number; y: number },
): number | null {
  if (!inBounds(target.x, target.y)) return null;
  if (target.x === dirah.x && target.y === dirah.y) return null;
  const open = new Set(bridges.map((bridge) => cellKey(bridge.x, bridge.y)));
  open.delete(cellKey(target.x, target.y));
  const queue = [{ x: dirah.x, y: dirah.y, d: 0 }];
  const seen = new Set<string>([cellKey(dirah.x, dirah.y)]);
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (!cur) break;
    for (const next of neighbors(cur.x, cur.y)) {
      if (next.x === target.x && next.y === target.y) return cur.d + 1;
      const key = cellKey(next.x, next.y);
      if (seen.has(key) || !open.has(key)) continue;
      seen.add(key);
      queue.push({ x: next.x, y: next.y, d: cur.d + 1 });
    }
  }
  return null;
}

export function sampleMarchCell(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  departAt: number,
  arriveAt: number,
  now: number,
) {
  const span = Math.max(1, arriveAt - departAt);
  const t = Math.min(1, Math.max(0, (now - departAt) / span));
  return {
    x: Math.round(fromX + (toX - fromX) * t),
    y: Math.round(fromY + (toY - fromY) * t),
  };
}
