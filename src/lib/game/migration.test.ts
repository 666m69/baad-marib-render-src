import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { storehouseForLegacyTent } from "./balance";

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
