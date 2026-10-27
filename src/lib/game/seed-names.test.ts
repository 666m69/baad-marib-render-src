// Seed and migration names vs the blocklist (MZ pre-deploy #4).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { blockedName } from "./names";
import { migrationNames, seedNameHits, seedNames } from "./seed-names";

const migrations = fileURLToPath(new URL("../../../migrations", import.meta.url));

test("«بنو أحمد» is blocked: أحمد is one of the Prophet's names ﷺ", () => {
  for (const name of ["بنو أحمد", "بني أحمد", "بنو احمد", "بنو أَحمد", "بنو أحـمد"]) assert.equal(blockedName(name), true, name);
});

test("every shipped tribe, sheikh and NPC name passes the blocklist", () => {
  const names = seedNames(migrations);
  assert.ok(names.length >= 30, `only ${names.length} names collected`);
  assert.deepEqual(seedNameHits(names), []);
});

test("the checker reads names from migrations and catches a blocked one", () => {
  const sql = `update tribes set sheikh_name = 'مهلهل' where sheikh_name = 'لبيد';
insert into tribes (user_id, name, x, y) values ('npc-1', 'بنو أحمد', 1, 2), ('npc-2', 'بنو السراب', 3, 4);`;
  const found = migrationNames("migrations/9999_test.sql", sql).map((n) => n.name);
  assert.deepEqual(found.sort(), ["بنو أحمد", "بنو السراب", "لبيد", "مهلهل"].sort());
  assert.deepEqual(seedNameHits(migrationNames("m.sql", sql)).map((n) => n.name), ["بنو أحمد"]);
});

test("npm run check:names exits 0 on the shipped data", () => {
  const tsx = fileURLToPath(new URL("../../../node_modules/.bin/tsx", import.meta.url));
  const run = spawnSync(tsx, ["scripts/check-seed-names.ts"], { cwd: fileURLToPath(new URL("../../..", import.meta.url)), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /none blocked/);
});
