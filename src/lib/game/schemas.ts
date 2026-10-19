import { z } from "zod";
import { WORLD } from "./balance";

/**
 * Shapes every game server function accepts. The engine still checks the game
 * rules (and answers in Arabic); these only reject malformed input with a 400.
 */
const text = (max: number) => z.string().max(max);
const count = z.number().int().min(0).max(100_000);
const cell = z.number().int().min(0).max(WORLD - 1);
const spot = z.object({ x: cell, y: cell }).strict();

export const schemas = {
  none: z.null(),
  foundTribe: z
    .object({ name: text(64), sheikh: text(64), trait: text(32), lineage: text(32).optional() })
    .strict(),
  kind: text(32),
  slot: z.number().int().min(0).max(63),
  spot,
  train: z.object({ kind: text(32), qty: z.number().int().min(1).max(1000) }).strict(),
  scout: z.object({ targetKind: z.enum(["player", "bandit", "saalik"]), targetId: text(128) }).strict(),
  attack: z
    .object({ targetKind: z.enum(["player", "bandit", "saalik"]), targetId: text(128), infantry: count, cavalry: count })
    .strict(),
  saalik: z.number().int().min(0).max(1_000_000),
  barter: z.object({ give: text(16), take: text(16), lots: z.number().int().min(1).max(1000) }).strict(),
  spoil: z.object({ x: cell, y: cell, infantry: count, cavalry: count }).strict(),
  letter: text(2000),
  reply: z.object({ id: z.number().int().min(1), body: text(2000) }).strict(),
} as const;

export type BadInput = { status: 400; issues: string[] };

/** Parse untrusted input. On failure call `onBad(400)` and throw, so the request ends as a 4xx, never a 500. */
export function checkInput<S extends z.ZodType>(schema: S, raw: unknown, onBad: (status: number) => void): z.infer<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  onBad(400);
  const error = new Error("مدخلات غير صالحة.") as Error & BadInput;
  error.status = 400;
  error.issues = result.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
  throw error;
}
