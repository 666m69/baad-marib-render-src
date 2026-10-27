import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { IDLE_AFTER_MS, POLL_GATE_MS, POLL_WORLD_MS, pollInterval } from "./polling";

test("polls slower than the old 8 s / 20 s", () => {
  assert.ok(POLL_WORLD_MS >= 20_000);
  assert.ok(POLL_GATE_MS >= 60_000);
});

test("no polling from a hidden tab or an idle player", () => {
  assert.equal(pollInterval(POLL_WORLD_MS, { visible: true, idleForMs: 0 }), POLL_WORLD_MS);
  assert.equal(pollInterval(POLL_WORLD_MS, { visible: false, idleForMs: 0 }), false);
  assert.equal(pollInterval(POLL_WORLD_MS, { visible: true, idleForMs: IDLE_AFTER_MS }), false);
});

test("the game screen uses the visibility-aware poll, not a fixed interval", () => {
  const app = readFileSync(new URL("../../components/game/GameApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /refetchInterval: \d/);
  assert.match(app, /refetchInterval: worldPoll/);
  assert.match(app, /refetchInterval: gatePoll/);
  assert.equal((app.match(/refetchIntervalInBackground: false/g) ?? []).length, 2);
});
