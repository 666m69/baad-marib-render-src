import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILDING_KINDS,
  BUILDINGS,
  FIELD_GOODS,
  FIELD_MAX,
  STORE_BASE,
  STORE_PER_LEVEL,
  capState,
  capsOf,
  emptyLevels,
  fieldCost,
  fitIncome,
  goldCap,
  keptNote,
  lootTransfer,
  storageCap,
  storehouseForLegacyTent,
  upgradeCost,
} from "./balance";
import { nextStep, storeNearFull, upgradeYield } from "./develop";
import type { YouState } from "./types";

test("storehouse is its own building, levels 0..10", () => {
  assert.ok(BUILDING_KINDS.includes("storehouse"));
  assert.equal(BUILDINGS.storehouse.label, "المخزن");
  assert.equal(BUILDINGS.storehouse.max, 10);
  assert.equal(emptyLevels(1).storehouse, 0);
});

test("goods cap: tent base 3000, +1500 per storehouse level, clamped to level 10", () => {
  assert.equal(STORE_BASE, 3000);
  assert.equal(STORE_PER_LEVEL, 1500);
  assert.equal(storageCap(0), 3000);
  assert.equal(storageCap(1), 4500);
  assert.equal(storageCap(10), 18000);
  assert.equal(storageCap(14), 18000);
  assert.equal(storageCap(-3), 3000);
});

test("the tent no longer raises the goods cap; gold has its own cap in the tent", () => {
  const low = capsOf({ ...emptyLevels(1), storehouse: 2 });
  const high = capsOf({ ...emptyLevels(8), storehouse: 2 });
  assert.equal(low.water, high.water);
  assert.equal(low.stone, storageCap(2));
  assert.ok(high.gold > low.gold);
  assert.equal(low.gold, goldCap(1));
  assert.notEqual(low.gold, low.food);
});

test("income above the cap is lost and reported, never stored", () => {
  const caps = capsOf({ ...emptyLevels(1), storehouse: 0 });
  const stock = { water: 2900, food: 3000, gold: 10, wood: 0, stone: 2999 };
  const { gain, lost } = fitIncome(stock, { water: 300, food: 50, gold: 40, wood: 120, stone: 5 }, caps);
  assert.deepEqual(gain, { water: 100, food: 0, gold: 40, wood: 120, stone: 1 });
  assert.deepEqual(lost, { water: 200, food: 50, gold: 0, wood: 0, stone: 4 });
  for (const key of ["water", "food", "gold", "wood", "stone"] as const) {
    assert.ok(stock[key] + gain[key] <= caps[key], key);
  }
});

test("a stock already over the cap gains nothing", () => {
  const caps = capsOf(emptyLevels(1));
  const { gain, lost } = fitIncome({ water: 9000, food: 0, gold: 0, wood: 0, stone: 0 }, { water: 50, food: 0, gold: 0, wood: 0, stone: 0 }, caps);
  assert.equal(gain.water, 0);
  assert.equal(lost.water, 50);
});

test("loot that does not fit stays with the target, and the note says so (not «lost»)", () => {
  assert.equal(keptNote({ water: 0, food: 0, gold: 0, wood: 0, stone: 0 }, "عندهم"), "");
  const note = keptNote({ water: 5, food: 12, gold: 0, wood: 0, stone: 0 }, "عندهم");
  assert.match(note, /^بقي عندهم /);
  assert.match(note, /12 طعام/);
  assert.match(note, /5 ماء/);
  assert.match(note, /لضيق المخزن/);
  assert.doesNotMatch(note, /ضاع/);
});

test("gold that does not fit is blamed on بيت المال, not the storehouse", () => {
  const gold = keptNote({ water: 0, food: 0, gold: 30, wood: 0, stone: 0 }, "عندهم");
  assert.match(gold, /30 ذهب لضيق بيت المال/);
  assert.doesNotMatch(gold, /المخزن/);
  const both = keptNote({ water: 0, food: 4, gold: 30, wood: 0, stone: 0 }, "عندهم");
  assert.match(both, /4 طعام لضيق المخزن/);
  assert.match(both, /30 ذهب لضيق بيت المال/);
});

test("lootTransfer moves exactly min(loot, target stock, raider room) per good and conserves the rest", () => {
  const want = { water: 50, food: 300, gold: 200, wood: 0, stone: 90 };
  const have = { water: 40, food: 1000, gold: 1000, wood: 500, stone: 1000 };
  const room = { water: 100, food: 120, gold: 0, wood: 999, stone: 90 };
  const { moved, left } = lootTransfer(want, have, room);
  assert.deepEqual(moved, { water: 40, food: 120, gold: 0, wood: 0, stone: 90 });
  assert.deepEqual(left, { water: 0, food: 180, gold: 200, wood: 0, stone: 0 });
  for (const k of ["water", "food", "gold", "wood", "stone"] as const) {
    assert.equal(moved[k] + left[k], Math.min(want[k], have[k]), k);
    assert.ok(moved[k] <= room[k] && moved[k] <= have[k], k);
  }
  // Negative or fractional inputs never create or destroy anything.
  assert.deepEqual(lootTransfer({ water: -5, food: 2.9, gold: 0, wood: 0, stone: 0 }, have, { ...room, food: -3 }).moved, {
    water: 0, food: 0, gold: 0, wood: 0, stone: 0,
  });
});

test("bar warns from 80% and is full at the cap", () => {
  assert.equal(capState(2399, 3000), "ok");
  assert.equal(capState(2400, 3000), "warn");
  assert.equal(capState(3000, 3000), "full");
  assert.equal(capState(3500, 3000), "full");
});

test("migration keeps existing tribes at or above their old tent cap", () => {
  for (let tent = 1; tent <= BUILDINGS.tent.max; tent++) {
    const legacy = 4500 + tent * 1400;
    const level = storehouseForLegacyTent(tent);
    assert.ok(level <= BUILDINGS.storehouse.max);
    assert.ok(storageCap(level) >= legacy, `tent ${tent}`);
  }
});

test("no deadlock: every upgrade can be paid from the room the storehouse can reach", () => {
  const maxGoods = storageCap(BUILDINGS.storehouse.max);
  for (const kind of BUILDING_KINDS) {
    for (let level = 1; level <= BUILDINGS[kind].max; level++) {
      const cost = upgradeCost(kind, level);
      for (const good of ["water", "food", "wood", "stone"] as const) assert.ok(cost[good] <= maxGoods, `${kind} ${level} ${good}`);
      assert.ok(cost.gold <= goldCap(BUILDINGS.tent.max), `${kind} ${level} gold`);
    }
  }
  for (const good of FIELD_GOODS) {
    for (let level = 1; level <= FIELD_MAX; level++) {
      const cost = fieldCost(good, level);
      assert.ok(cost.wood <= maxGoods && cost.stone <= maxGoods, `${good} ${level}`);
    }
  }
  for (let level = 1; level <= BUILDINGS.storehouse.max; level++) {
    const cost = upgradeCost("storehouse", level);
    const room = storageCap(level - 1);
    assert.ok(cost.wood <= room && cost.stone <= room, `storehouse ${level} must fit cap at ${level - 1}`);
  }
});

function you(over: Partial<YouState> = {}): YouState {
  const base = {
    water: 100,
    food: 100,
    gold: 100,
    wood: 100,
    stone: 100,
    storageCap: storageCap(0),
    goldCap: goldCap(1),
    buildings: [
      { kind: "tent", level: 1, upgradeUntil: null },
      { kind: "well", level: 2, upgradeUntil: null },
      { kind: "farm", level: 1, upgradeUntil: null },
      { kind: "workshop", level: 0, upgradeUntil: null },
      { kind: "barracks", level: 0, upgradeUntil: null },
      { kind: "storehouse", level: 0, upgradeUntil: null },
    ],
    studies: [],
    renown: 0,
    fields: [],
    chain: null,
    rates: { water: 0, food: 0, gold: 0, wood: 0, stone: 0 },
  };
  return { ...base, ...over } as unknown as YouState;
}

test("guide: build the storehouse after the first well and farm", () => {
  assert.equal(nextStep(you()).kind, "storehouse");
});

test("guide: a near-full store jumps the storehouse to the front", () => {
  const nearly = you({
    food: 2500,
    buildings: [
      { kind: "tent", level: 1, upgradeUntil: null },
      { kind: "well", level: 0, upgradeUntil: null },
      { kind: "farm", level: 0, upgradeUntil: null },
      { kind: "workshop", level: 0, upgradeUntil: null },
      { kind: "barracks", level: 0, upgradeUntil: null },
      { kind: "storehouse", level: 0, upgradeUntil: null },
    ],
  } as Partial<YouState>);
  assert.ok(storeNearFull(nearly));
  const step = nextStep(nearly);
  assert.equal(step.kind, "storehouse");
  assert.equal(step.title, "ارفع المخزن");
});

test("storehouse card shows the next cap", () => {
  const lines = upgradeYield(you(), "storehouse");
  const row = lines.find((line) => line.label === "سعة المخزن");
  assert.ok(row);
  assert.equal(row.now, "3,000");
  assert.equal(row.next, "4,500");
});

test("banked accrual: 6/min polled every 8 s for 96 s gives 9, not 0", async () => {
  const { accrueGood } = await import("./balance");
  let state = { stock: 0, bank: 0 };
  for (let i = 0; i < 12; i++) state = accrueGood(state.stock, state.bank, 6, 8000, 3000);
  assert.equal(state.stock, 9);
  assert.equal(state.bank, 600);
  assert.deepEqual(accrueGood(2999, 900, 60, 60_000, 3000), { stock: 3000, bank: 0 });
  assert.deepEqual(accrueGood(5000, 10, 60, 60_000, 3000), { stock: 5000, bank: 0 });
  assert.deepEqual(accrueGood(10, 5, 0, 60_000, 3000), { stock: 10, bank: 5 });
});

test("people growth keeps its remainder too", async () => {
  const { growPeople } = await import("./balance");
  assert.deepEqual(growPeople(5, 0, 100, 8000, 50, 20_000, 40), { people: 5, bank: 8000 });
  assert.deepEqual(growPeople(5, 16_000, 100, 8000, 50, 20_000, 40), { people: 6, bank: 4000 });
  assert.deepEqual(growPeople(5, 0, 10, 8000, 50, 20_000, 40), { people: 5, bank: 0 });
});

test("the storehouse hint no longer says loot is lost to a full storehouse", async () => {
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(new URL("./develop.ts", import.meta.url), "utf8");
  assert.doesNotMatch(text, /حتى الغنيمة/);
  assert.match(text, /الغنيمة التي لا تسعها تبقى عند أهلها/);
});
