/**
 * Every tribe / sheikh / NPC name the game itself ships (code seed data and
 * names written by migrations), checked against the player-name blocklist.
 * Used by scripts/check-seed-names.ts (`npm run check:names`, part of npm test).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LINEAGE, LINEAGES, SAALIK_BANDS, SHEIKH_NAMES, SUGGESTED_NAMES, banditLabel } from "./balance";
import { blockedName } from "./names";

export type SeedName = { name: string; source: string };

/** Names that migrations write into name columns: `name = '…'`, `sheikh_name = '…'`, `values ('…'…)` into tribes. */
export function migrationNames(file: string, sql: string): SeedName[] {
  const out: SeedName[] = [];
  const assign = /\b(?:name|sheikh_name|attacker_name|defender_name)\s*=\s*'((?:[^']|'')*)'/gi;
  for (const m of sql.matchAll(assign)) out.push({ name: m[1].replace(/''/g, "'"), source: file });
  const insert = /insert\s+into\s+(?:tribes|sheikhs)\s*\(([^)]*)\)\s*values\s*([\s\S]*?);/gi;
  for (const m of sql.matchAll(insert)) {
    const cols = m[1].split(",").map((c) => c.trim().replace(/"/g, ""));
    for (const tuple of m[2].matchAll(/\(([^)]*)\)/g)) {
      const vals = [...tuple[1].matchAll(/\s*(?:'((?:[^']|'')*)'|[^,]+)/g)].map((v) => (v[1] ?? v[0]).trim());
      cols.forEach((col, i) => {
        if (/name$/.test(col) && vals[i] !== undefined) out.push({ name: vals[i].replace(/''/g, "'"), source: file });
      });
    }
  }
  return out;
}

export function seedNames(migrationsDir: string): SeedName[] {
  const names: SeedName[] = [
    ...SUGGESTED_NAMES.flatMap((n) => [
      { name: n, source: "balance.ts SUGGESTED_NAMES" },
      { name: `بنو ${n}`, source: "balance.ts SUGGESTED_NAMES (with بنو)" },
    ]),
    ...SHEIKH_NAMES.map((n) => ({ name: n, source: "balance.ts SHEIKH_NAMES" })),
    ...LINEAGES.map((id) => ({ name: LINEAGE[id].name, source: `balance.ts LINEAGE.${id}` })),
    ...SAALIK_BANDS.map((b) => ({ name: b.name, source: "balance.ts SAALIK_BANDS" })),
    ...[1, 2, 3, 4].map((t) => ({ name: banditLabel(t), source: `balance.ts banditKit(${t})` })),
  ];
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    names.push(...migrationNames(`migrations/${file}`, readFileSync(join(migrationsDir, file), "utf8")));
  }
  return names;
}

/** The shipped names the blocklist refuses (empty = clean). */
export function seedNameHits(names: SeedName[]): SeedName[] {
  return names.filter(({ name }) => blockedName(name));
}
