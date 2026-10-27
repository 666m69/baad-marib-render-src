// GET /health (MZ pre-deploy #2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Sql } from "../db";
import { HEALTH_LIMIT, healthGate, healthLimiter, healthResponse } from "../health";

const fake = (run: () => Promise<unknown[]>) => {
  const sql = (() => run()) as unknown as Sql;
  sql.query = (() => run()) as Sql["query"];
  return async () => sql;
};

test("GET /health answers 200 ok when select 1 succeeds (real PGlite)", async () => {
  process.env.PGLITE_MEMORY = "1"; // throwaway in-memory database, never .data/
  const { getSql } = await import("../db");
  const res = await healthResponse(getSql);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("GET /health answers 503 when the database throws", async () => {
  const res = await healthResponse(fake(async () => Promise.reject(new Error("connection refused"))));
  assert.equal(res.status, 503);
  assert.equal(await res.text(), "database unavailable");
});

test("GET /health answers 503 when the database cannot even be opened", async () => {
  const res = await healthResponse(() => Promise.reject(new Error("no pool")));
  assert.equal(res.status, 503);
});

test("GET /health answers 503 when the database hangs past the timeout", async () => {
  const res = await healthResponse(fake(() => new Promise(() => undefined)), 50);
  assert.equal(res.status, 503);
});

test("the /health route is wired to the check and render.yaml points at it", () => {
  const route = readFileSync(new URL("../../routes/health.ts", import.meta.url), "utf8");
  assert.match(route, /createFileRoute\("\/health"\)/);
  assert.match(route, /GET: \(\{ request \}\) => healthGate\(request, getSql\)/);
  const yaml = readFileSync(new URL("../../../render.yaml", import.meta.url), "utf8");
  assert.match(yaml, /^\s+healthCheckPath: \/health$/m);
});

// ---- QA N6 / S4: a simple per-IP limit on /health that never trips Render's own check ----

const onRender = (ip: string, forged = "") =>
  new Request("http://x/health", { headers: { "x-forwarded-for": `${forged ? `${forged}, ` : ""}${ip}, 172.71.195.123, 10.226.90.65` } });

test("/health: one public IP gets HEALTH_LIMIT answers a minute, then 429 without touching the database", async () => {
  let t = 0;
  const allow = healthLimiter(HEALTH_LIMIT.max, HEALTH_LIMIT.windowMs, () => t);
  let dbCalls = 0;
  const db = fake(async () => {
    dbCalls += 1;
    return [{ ok: 1 }];
  });
  const statuses: number[] = [];
  for (let i = 0; i < HEALTH_LIMIT.max + 5; i++) statuses.push((await healthGate(onRender("198.51.100.9"), db, allow, 3)).status);
  assert.deepEqual(statuses.slice(0, HEALTH_LIMIT.max), Array(HEALTH_LIMIT.max).fill(200));
  assert.deepEqual(statuses.slice(HEALTH_LIMIT.max), Array(5).fill(429));
  assert.equal(dbCalls, HEALTH_LIMIT.max, "limited calls never reach select 1");
  const limited = await healthGate(onRender("198.51.100.9"), db, allow, 3);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(limited.headers.get("cache-control"), "no-store");
  // Another client is not affected, and the window resets.
  assert.equal((await healthGate(onRender("198.51.100.10"), db, allow, 3)).status, 200);
  t += HEALTH_LIMIT.windowMs;
  assert.equal((await healthGate(onRender("198.51.100.9"), db, allow, 3)).status, 200);
});

test("/health: a forged X-Forwarded-For does not get a fresh counter", async () => {
  const allow = healthLimiter(3, 60_000, () => 0);
  const db = fake(async () => [{ ok: 1 }]);
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) statuses.push((await healthGate(onRender("198.51.100.20", `10.0.0.${i}`), db, allow, 3)).status);
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
});

test("/health: Render's internal health check (no client IP) is never limited", async () => {
  const allow = healthLimiter(1, 60_000, () => 0);
  const db = fake(async () => [{ ok: 1 }]);
  for (let i = 0; i < 50; i++) {
    const res = await healthGate(new Request("http://10.0.0.5:10000/health"), db, allow, 3);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
  }
  // Even with one internal hop of its own it is not a public caller.
  assert.equal((await healthGate(new Request("http://x/health", { headers: { "x-forwarded-for": "10.226.0.3" } }), db, allow, 3)).status, 200);
});
