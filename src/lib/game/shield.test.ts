import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attackDropsShield } from "./balance";

test("attacking bandits or صعاليك keeps the beginner shield", () => {
  assert.equal(attackDropsShield("bandit"), false);
  assert.equal(attackDropsShield("saalik"), false);
});

test("attacking another player's camp drops the shield", () => {
  assert.equal(attackDropsShield("player"), true);
});

test("the attack order applies the shield rule instead of always dropping it", () => {
  const src = readFileSync(new URL("./engine.server.ts", import.meta.url), "utf8");
  const start = src.indexOf("export function attack(");
  const end = src.indexOf("export function hireSaalik(");
  const body = src.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(body, /attackDropsShield\(input\.targetKind\)/);
  assert.doesNotMatch(body, /attacked = true,/);
  assert.doesNotMatch(body, /peace_until = null\n/);
});

test("shield texts match the rule: fighting bandits or صعاليك keeps it", () => {
  const panels = readFileSync(new URL("../../components/game/Panels.tsx", import.meta.url), "utf8");
  const engine = readFileSync(new URL("./engine.server.ts", import.meta.url), "utf8");
  assert.match(panels, /warn=\{!you\.attacked && attackDropsShield\("bandit"\)\}/);
  assert.match(panels, /warn=\{!you\.attacked && attackDropsShield\("saalik"\)\}/);
  for (const stale of ["القتال يُسقط الدرع", "الهجوم يُسقط درع المبتدئ", "ويسقط إن شهرت السلاح", "شهرت السلاح"]) {
    assert.ok(!panels.includes(stale) && !engine.includes(stale), stale);
  }
  assert.match(engine, /قتال العصابات والصعاليك لا يُسقطه/);
});
