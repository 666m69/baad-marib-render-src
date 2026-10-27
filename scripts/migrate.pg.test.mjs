// The migration runner connects through DATABASE_URL_UNPOOLED when it is set (MZ pre-deploy #3).
// Needs TEST_PG_URL (throwaway local Postgres); skips cleanly without it. Works in a scratch schema.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.TEST_PG_URL?.trim();
const skip = url ? false : "TEST_PG_URL is not set (no local Postgres)";
const root = fileURLToPath(new URL("..", import.meta.url));

test("migrate.mjs applies every migration through DATABASE_URL_UNPOOLED, ignoring a broken pooled DATABASE_URL", { skip }, async () => {
  const schema = `migrate_test_${process.pid}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`drop schema if exists ${schema} cascade; create schema ${schema}`);
    const scoped = new URL(url);
    scoped.searchParams.set("options", `-c search_path=${schema}`);
    const run = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: "postgres://nobody:nothing@127.0.0.1:1/pooled_should_not_be_used",
        DATABASE_URL_UNPOOLED: scoped.toString(),
      },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /using DATABASE_URL_UNPOOLED/);
    const { rows } = await admin.query(`select count(*)::int as n from ${schema}._migrations`);
    assert.ok(rows[0].n >= 19, `applied ${rows[0].n}`);
  } finally {
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
