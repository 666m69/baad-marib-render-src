import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clampCamera } from "./camera";
import { WORLD } from "./balance";

test("the map camera never shows space past the valley's edge (QA #16)", () => {
  assert.deepEqual(clampCamera(-3, -2, 8, 12, WORLD), { x: 0, y: 0 });
  assert.deepEqual(clampCamera(30, 31, 8, 12, WORLD), { x: WORLD - 8, y: WORLD - 12 });
  assert.deepEqual(clampCamera(10, 10, 8, 12, WORLD), { x: 10, y: 10 });
  // A view wider than the valley centres it instead of hugging one side.
  assert.deepEqual(clampCamera(5, 5, 40, 12, WORLD), { x: (WORLD - 40) / 2, y: 5 });
});

test("resource chips stack value over cap on phones, left-to-right, without overflow (QA #9)", () => {
  const app = readFileSync(new URL("../../components/game/GameApp.tsx", import.meta.url), "utf8");
  const chip = app.slice(app.indexOf("function Chip("), app.indexOf("function NavButton("));
  assert.match(chip, /dir="ltr"/);
  assert.match(chip, /flex-col[^"]*sm:flex-row/);
  assert.match(chip, /whitespace-nowrap/);
  assert.match(chip, /overflow-hidden/);
  assert.doesNotMatch(chip, /text-\[10px\][^"]*underline/, "the raise link is at least 11px");
  const at = app.indexOf('data-testid="game-header"');
  const header = app.slice(app.lastIndexOf("<div", at), app.indexOf('data-testid="resource-bar"'));
  assert.match(header, /flex-wrap/);
  assert.match(header, /<Link to="\/diwan" className="[^"]*inline-flex[^"]*items-center/);
});
