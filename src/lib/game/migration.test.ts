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
  // QA #13: nothing is lost silently. Every cut is logged once, and the documented line restores it.
  const log = await pg.query<{ user_id: string; good: string; removed: number }>(
    `select user_id, good, removed from cap_clamp_log order by user_id, good`,
  );
  assert.deepEqual(log.rows.map((r) => ({ ...r })), [
    { user_id: "big", good: "gold", removed: 15000 - goldCap(8) },
    { user_id: "rich", good: "gold", removed: 9000 - goldCap(1) },
    { user_id: "rich", good: "water", removed: 99999 - storageCap(0) },
  ]);
  const doc = readFileSync(new URL("../../../docs/deploy.md", import.meta.url), "utf8");
  const rollback = /<!-- rollback-0015-sql -->\s*```sql\n(.+)\n```/.exec(doc)?.[1];
  assert.ok(rollback, "docs/deploy.md must carry the 0015 rollback line");
  await pg.exec(rollback);
  assert.deepEqual({ ...(await get("rich")) }, { gold: 9000, water: 99999, food: 10 });
  assert.deepEqual({ ...(await get("big")) }, { gold: 15000, water: 17000, food: 10 });
  await pg.close();
});

test("0017 rewrites old stored reports that named the two Companions", async () => {
  const pg = new PGlite();
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files.filter((f) => f < "0017")) await pg.exec(readFileSync(DIR + f, "utf8"));
  const old = ["حسان", "بن", "ثابت"].join(" ");
  const kab = ["كعب", "بن", "مالك"].join(" ");
  await pg.query(`insert into reports (user_id, kind, title, body) values ('a', 'found', 't', $1), ('b', 'found', 't', $2), ('c', 'x', 't', 'إحسان')`, [
    `خرجت القبيلة. وشاعرها ${old}.`,
    `وشاعرها ${kab}.`,
  ]);
  await pg.exec(readFileSync(DIR + "0017_scrub_companions.sql", "utf8"));
  const { rows } = await pg.query<{ user_id: string; body: string }>(`select user_id, body from reports order by user_id`);
  for (const r of rows) assert.ok(!r.body.includes(old) && !r.body.includes(kab), r.body);
  assert.match(rows[0].body, /أحيحة بن الجلاح/);
  assert.match(rows[1].body, /حادي تهامة \(شخصية متخيَّلة\)/);
  assert.equal(rows[2].body, "إحسان");
  await pg.close();
});

test("0016 adds the resource banks and the valley tick stamp", async () => {
  const pg = new PGlite();
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) await pg.exec(readFileSync(DIR + f, "utf8"));
  const cols = await pg.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_name in ('tribes', 'world_meta')`,
  );
  const names = cols.rows.map((r) => r.column_name);
  for (const c of ["water_bank", "food_bank", "gold_bank", "wood_bank", "stone_bank", "last_tick"]) assert.ok(names.includes(c), c);
  await pg.close();
});

test("0019 renames a stored «لبيد» sheikh and fixes «على بنو» in old reports", async () => {
  const pg = new PGlite();
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files.filter((f) => f < "0019")) await pg.exec(readFileSync(DIR + f, "utf8"));
  await pg.query(`insert into tribes (user_id, name, x, y, water, food, gold, wood, stone, people, sheikh_name) values ('a', 'بنو السراب', 0, 0, 0, 0, 0, 0, 0, 0, 'لبيد'), ('b', 'كندة', 1, 1, 0, 0, 0, 0, 0, 0, 'قيس')`);
  await pg.query(`insert into reports (user_id, kind, title, body) values ('a', 'battle', 'نصر على بنو السراب', 'هجوم على بنو السراب. بنو السراب خسروا.'), ('b', 'battle', 'هزيمة أمام بنو الرمل', 'بنو الرمل')`);
  await pg.exec(readFileSync(DIR + "0019_names_grammar.sql", "utf8"));
  const t = await pg.query<{ sheikh_name: string }>(`select sheikh_name from tribes order by user_id`);
  assert.deepEqual(t.rows.map((r) => r.sheikh_name), ["مهلهل", "قيس"]);
  const r = await pg.query<{ title: string; body: string }>(`select title, body from reports order by user_id`);
  assert.deepEqual(r.rows.map((x) => ({ ...x })), [
    { title: "نصر على بني السراب", body: "هجوم على بني السراب. بنو السراب خسروا." },
    { title: "هزيمة أمام بني الرمل", body: "بنو الرمل" },
  ]);
  await pg.close();
});
