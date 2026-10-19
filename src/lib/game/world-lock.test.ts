import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { WORLD_LOCK_SQL, inWorld, type Begin } from "./world-lock";

function wrap(run: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>): Sql {
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`;
    return (await run(text, values)).rows;
  }) as unknown as Sql;
  sql.query = (async (text: string, params?: unknown[]) => (await run(text, params)).rows) as Sql["query"];
  return sql;
}

test("the valley lock is a Postgres advisory transaction lock taken first", async () => {
  assert.match(WORLD_LOCK_SQL, /^select pg_advisory_xact_lock\(\d+\)$/);
  const seen: string[] = [];
  const begin: Begin = (fn) => fn(wrap(async (text) => (seen.push(text), { rows: [] })));
  await inWorld(begin, async (tx) => {
    await tx.query("select 1");
  });
  assert.deepEqual(seen, [WORLD_LOCK_SQL, "select 1"]);
});

test("locked transactions commit together and roll back on error", async () => {
  const pg = new PGlite();
  await pg.exec("create table c (n int); insert into c values (0);");
  const begin: Begin = (fn) => pg.transaction((tx) => fn(wrap((t, p) => tx.query(t, p))));
  const bump = () =>
    inWorld(begin, async (tx) => {
      const [r] = (await tx.query("select n from c")) as { n: number }[];
      await new Promise((ok) => setTimeout(ok, 5));
      await tx.query("update c set n = $1", [r.n + 1]);
    });
  await Promise.all(Array.from({ length: 8 }, bump));
  assert.equal((await pg.query<{ n: number }>("select n from c")).rows[0].n, 8);
  await assert.rejects(
    inWorld(begin, async (tx) => {
      await tx.query("update c set n = 100");
      throw new Error("boom");
    }),
  );
  assert.equal((await pg.query<{ n: number }>("select n from c")).rows[0].n, 8);
  await pg.close();
});

test("the engine has no in-memory lock left; every entry point uses the DB lock", () => {
  const src = readFileSync(new URL("./engine.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /let chain: Promise/);
  assert.match(src, /return inWorld\(withTransaction, fn\)/);
  assert.doesNotMatch(src, /getSql\(/);
});
