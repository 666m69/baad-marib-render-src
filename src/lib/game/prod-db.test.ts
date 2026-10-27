// Production never falls back to PGlite (MZ pre-deploy #1): importing the db module exits 1.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const tsx = fileURLToPath(new URL("../../../node_modules/.bin/tsx", import.meta.url));
const load = (env: Record<string, string>) =>
  spawnSync(tsx, ["-e", 'import("./src/lib/db.ts").then(() => console.log("db module loaded"))'], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", PGLITE_MEMORY: "1", ...env },
  });

test("with NODE_ENV=production and no DATABASE_URL the db module logs why and exits 1 instead of opening PGlite", () => {
  const run = load({ NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(40), BETTER_AUTH_URL: "https://example.org" });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /\[db\] refusing to start in production/);
  assert.match(run.stderr, /DATABASE_URL is missing/);
  assert.doesNotMatch(run.stdout, /db module loaded/);
});

test("with NODE_ENV=production and no BETTER_AUTH_SECRET the db module exits 1 too", () => {
  const run = load({ NODE_ENV: "production", DATABASE_URL: "postgres://u:p@127.0.0.1:1/x", BETTER_AUTH_URL: "https://example.org" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /BETTER_AUTH_SECRET is missing/);
});

test("outside production the db module still loads on PGlite", () => {
  const run = load({});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /db module loaded/);
});
