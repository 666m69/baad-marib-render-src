import type { Cost } from "./balance";
import { RESOURCE_LABEL } from "./balance";

export function fmt(n: number) {
  return Math.floor(n).toLocaleString("en-US");
}

export function fmtRemain(ms: number) {
  if (ms <= 0) return "الآن";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const COST_KEYS = ["wood", "stone", "gold", "food", "water", "people"] as const;

export function costParts(cost: Partial<Cost>) {
  const parts: string[] = [];
  for (const key of COST_KEYS) {
    const n = cost[key] ?? 0;
    if (n > 0) parts.push(`${fmt(n)} ${RESOURCE_LABEL[key]}`);
  }
  if ((cost.seconds ?? 0) > 0) parts.push(fmtRemain((cost.seconds ?? 0) * 1000));
  return parts;
}

export function shortage(
  have: { water: number; food: number; gold: number; wood: number; stone: number; people: number },
  cost: Partial<Cost>,
) {
  const parts: string[] = [];
  for (const key of COST_KEYS) {
    const need = cost[key] ?? 0;
    if (have[key] < need) parts.push(`${fmt(need - have[key])} ${RESOURCE_LABEL[key]}`);
  }
  if (!parts.length) return null;
  return `ينقصك ${parts.join(" و")}`;
}

export function tribeCount(n: number) {
  if (n <= 0) return "لا قبائل في الوادي بعد";
  if (n === 1) return "قبيلة واحدة في الوادي";
  if (n === 2) return "قبيلتان في الوادي";
  return `${fmt(n)} قبائل في الوادي`;
}
