// GET /health (MZ pre-deploy #2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Sql } from "../db";
import { healthResponse } from "../health";

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
  assert.match(route, /GET: \(\) => healthResponse\(getSql\)/);
  const yaml = readFileSync(new URL("../../../render.yaml", import.meta.url), "utf8");
  assert.match(yaml, /^\s+healthCheckPath: \/health$/m);
});
