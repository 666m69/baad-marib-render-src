// Production refuses to start without DATABASE_URL / BETTER_AUTH_SECRET (MZ pre-deploy #1).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { productionEnvProblems } from "./env-check.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@db.example/neondb?sslmode=require",
  BETTER_AUTH_SECRET: "x".repeat(40),
  BETTER_AUTH_URL: "https://baad-marib.onrender.com",
};
const fakeServer = () => {
  const dir = mkdtempSync(join(tmpdir(), "baad-start-"));
  const file = join(dir, "server.mjs");
  writeFileSync(file, 'console.log("fake server booted");\n');
  return file;
};
const start = (env) =>
  spawnSync(process.execPath, ["scripts/start.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH, SERVER_ENTRY: fakeServer(), ...env },
  });

test("production start exits 1 with a clear log when DATABASE_URL is missing (no PGlite fallback)", () => {
  const { DATABASE_URL: _unused, ...env } = good;
  const run = start(env);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /refusing to start in production/);
  assert.match(run.stderr, /DATABASE_URL is missing/);
  assert.doesNotMatch(run.stdout, /booted/);
});

test("production start exits 1 when BETTER_AUTH_SECRET is missing or blank, and never prints secrets", () => {
  for (const secret of [undefined, "   "]) {
    const run = start({ ...good, BETTER_AUTH_SECRET: secret });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /BETTER_AUTH_SECRET is missing/);
    assert.doesNotMatch(run.stderr, /u:p@db\.example/);
  }
});

test("production start boots the server when every required value is set", () => {
  const run = start(good);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /fake server booted/);
});

test("outside production the start script does not demand production settings", () => {
  const run = start({ NODE_ENV: "development" });
  assert.equal(run.status, 0, run.stderr);
});

test("productionEnvProblems lists every missing value and rejects short secrets and http URLs", () => {
  assert.deepEqual(productionEnvProblems(good), []);
  assert.equal(productionEnvProblems({ NODE_ENV: "production" }).length, 3);
  assert.match(productionEnvProblems({ ...good, BETTER_AUTH_SECRET: "short" }).join(), /32 characters/);
  assert.match(productionEnvProblems({ ...good, BETTER_AUTH_URL: "http://x" }).join(), /https/);
});

test("render.yaml starts the server through the checking start script", async () => {
  const { readFileSync } = await import("node:fs");
  const yaml = readFileSync(join(root, "render.yaml"), "utf8");
  assert.match(yaml, /^\s+startCommand: node scripts\/start\.mjs$/m);
});
