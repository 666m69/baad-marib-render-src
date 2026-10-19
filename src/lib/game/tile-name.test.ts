// Map tile names are shown in full (QA #15, MZ pre-deploy #5). The browser side is
// covered by scripts/layout-check.mjs ("tiles" in its output); this guards the markup.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const map = readFileSync(new URL("../../components/game/MapView.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const rule = (sel: string) => css.match(new RegExp(`\\${sel} \\{([^}]*)\\}`))?.[1] ?? "";

test("the tile name is not truncated: no truncate/ellipsis/line clamp, wraps instead", () => {
  const label = map.match(/<span data-testid="tile-name"[^>]*>/)?.[0] ?? "";
  assert.ok(label, "tile-name label exists");
  assert.doesNotMatch(label, /truncate|max-w-11|line-clamp|text-ellipsis/);
  const name = rule(".tile-name");
  assert.match(name, /white-space: normal/);
  assert.match(name, /overflow-wrap: anywhere/);
  assert.doesNotMatch(name, /ellipsis|line-clamp/);
});

test("a camp tile lets its label spill over neighbours and carries the full name as a tooltip", () => {
  assert.match(rule(".cell-camp"), /overflow: visible/);
  assert.match(map, /\$\{camp \? "cell-camp" : ""\}/);
  assert.match(map, /title=\{camp \? camp\.name : undefined\}/);
});

test("the layout check measures tile names for clipping", () => {
  const check = readFileSync(new URL("../../../scripts/layout-check.mjs", import.meta.url), "utf8");
  assert.match(check, /\[data-testid="tile-name"\]/);
});
