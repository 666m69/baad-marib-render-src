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
