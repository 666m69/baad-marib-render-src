import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { goldCap, storageCap, storehouseForLegacyTent } from "./balance";

const DIR = new URL("../../../migrations/", import.meta.url).pathname;

test("0014 gives existing tribes a storehouse at least as roomy as their old tent", async () => {
  const pg = new PGlite(); // in-memory: never touches .data/
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const before = files.filter((f) => f < "0014");
  for (const f of before) await pg.exec(readFileSync(DIR + f, "utf8"));
  const tents = [1, 2, 5, 8];
  for (const [i, tent] of tents.entries()) {
    await pg.query(`insert into tribes (user_id, name, x, y, water, food, gold, wood, stone, people) values ($1, $2, $3, $3, 0, 0, 0, 0, 0, 0)`, [`u${i}`, `t${i}`, i]);
    await pg.query(`insert into buildings (user_id, kind, level) values ($1, 'tent', $2)`, [`u${i}`, tent]);
  }
  await pg.query(`insert into tribes (user_id, name, x, y, water, food, gold, wood, stone, people) values ('bare', 'bare', 9, 9, 0, 0, 0, 0, 0, 0)`);
  await pg.exec(readFileSync(DIR + "0014_storehouse.sql", "utf8"));
  for (const [i, tent] of tents.entries()) {
    const { rows } = await pg.query<{ level: number }>(`select level from buildings where user_id = $1 and kind = 'storehouse'`, [`u${i}`]);
    assert.equal(rows[0]?.level, storehouseForLegacyTent(tent), `tent ${tent}`);
  }
  const bare = await pg.query<{ level: number }>(`select level from buildings where user_id = 'bare' and kind = 'storehouse'`);
  assert.equal(bare.rows[0]?.level, storehouseForLegacyTent(1));
  await pg.exec(readFileSync(DIR + "0014_storehouse.sql", "utf8")); // re-run is a no-op
  const count = await pg.query<{ n: number }>(`select count(*)::int as n from buildings where kind = 'storehouse'`);
  assert.equal(count.rows[0]?.n, tents.length + 1);
  await pg.close();
});

test("0015 clamps stock above the new caps (gold to بيت المال, goods to the storehouse)", async () => {
  const pg = new PGlite();
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files.filter((f) => f < "0015")) await pg.exec(readFileSync(DIR + f, "utf8"));
  const add = async (id: string, tent: number, store: number, gold: number, water: number) => {
    await pg.query(
      `insert into tribes (user_id, name, x, y, water, food, gold, wood, stone, people) values ($1, $1, 0, 0, $2, 10, $3, 10, 10, 0)`,
      [id, water, gold],
    );
    await pg.query(`insert into buildings (user_id, kind, level) values ($1, 'tent', $2), ($1, 'storehouse', $3)`, [id, tent, store]);
  };
  await add("rich", 1, 0, 9000, 99999);
  await add("big", 8, 10, 15000, 17000);
  await add("poor", 1, 2, 100, 50);
  await pg.exec(readFileSync(DIR + "0015_clamp_caps.sql", "utf8"));
  const get = async (id: string) =>
    (await pg.query<{ gold: number; water: number; food: number }>(`select gold, water, food from tribes where user_id = $1`, [id])).rows[0];
  assert.deepEqual({ ...(await get("rich")) }, { gold: goldCap(1), water: storageCap(0), food: 10 });
  assert.deepEqual({ ...(await get("big")) }, { gold: goldCap(8), water: 17000, food: 10 });
  assert.deepEqual({ ...(await get("poor")) }, { gold: 100, water: 50, food: 10 });
  await pg.exec(readFileSync(DIR + "0015_clamp_caps.sql", "utf8"));
  assert.equal((await get("rich"))?.gold, goldCap(1));
  await pg.close();
});
