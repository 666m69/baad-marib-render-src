/**
 * The valley lock on a REAL Postgres with two separate connections.
 * Needs TEST_PG_URL (a throwaway database); skips cleanly without it.
 *
 *   TEST_PG_URL=postgres://baad:baad@127.0.0.1:5432/baad_test npm run test:pg
 */
import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { Sql } from "@/lib/db";
import { WORLD_LOCK_KEY, inWorld, type Begin } from "./world-lock";

const url = process.env.TEST_PG_URL?.trim();
const skip = url ? false : "TEST_PG_URL is not set (no local Postgres)";

/** A `Begin` on one dedicated connection, shaped like db.ts withTransaction on Neon. */
function beginOn(client: pg.Client): Begin {
  const tx = { query: (text: string, params?: unknown[]) => client.query(text, params).then((r) => r.rows) } as unknown as Sql;
  return async (fn) => {
    await client.query("begin");
    try {
      const out = await fn(tx);
      await client.query("commit");
      return out;
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("two connections: the second waits for the first to commit, and no update is lost", { skip }, async () => {
  const a = new pg.Client({ connectionString: url });
  const b = new pg.Client({ connectionString: url });
  const setup = new pg.Client({ connectionString: url });
  await Promise.all([a.connect(), b.connect(), setup.connect()]);
  try {
    await setup.query("drop table if exists lock_probe; create table lock_probe (id int primary key, n int not null); insert into lock_probe values (1, 0)");
    const order: string[] = [];
    // Read-modify-write with a pause in the middle: without the lock the two
    // would both read 0 and the result would be 1.
    const bump = (who: string, begin: Begin) =>
      inWorld(begin, async (tx) => {
        order.push(`${who}:in`);
        const [row] = (await tx.query("select n from lock_probe where id = 1")) as Array<{ n: number }>;
        await sleep(300);
        await tx.query("update lock_probe set n = $1 where id = 1", [row.n + 1]);
        order.push(`${who}:out`);
      });
    const first = bump("A", beginOn(a));
    await sleep(50);
    // While A holds the lock, B's lock call must be visibly waiting on it.
    const second = bump("B", beginOn(b));
    await sleep(100);
    const waiting = await setup.query(
      "select count(*)::int as n from pg_locks where locktype = 'advisory' and objid = $1 and not granted",
      [WORLD_LOCK_KEY],
    );
    assert.equal(waiting.rows[0].n, 1, "B should be blocked on the advisory lock");
    await Promise.all([first, second]);
    assert.deepEqual(order, ["A:in", "A:out", "B:in", "B:out"]);
    const done = await setup.query("select n from lock_probe where id = 1");
    assert.equal(done.rows[0].n, 2);
  } finally {
    await setup.query("drop table if exists lock_probe").catch(() => {});
    await Promise.all([a.end(), b.end(), setup.end()]);
  }
});

test("the lock is released on rollback, so a failed write never wedges the valley", { skip }, async () => {
  const a = new pg.Client({ connectionString: url });
  const b = new pg.Client({ connectionString: url });
  await Promise.all([a.connect(), b.connect()]);
  try {
    await assert.rejects(inWorld(beginOn(a), async () => { throw new Error("boom"); }), /boom/);
    const started = Date.now();
    await inWorld(beginOn(b), async () => {});
    assert.ok(Date.now() - started < 1000);
  } finally {
    await Promise.all([a.end(), b.end()]);
  }
});
