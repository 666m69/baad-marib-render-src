import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkInput, schemas } from "./schemas";

function rejects(schema: (typeof schemas)[keyof typeof schemas], raw: unknown) {
  let status = 0;
  assert.throws(
    () => checkInput(schema, raw, (s) => (status = s)),
    (err: Error & { status?: number }) => err.status === 400,
  );
  assert.equal(status, 400, JSON.stringify(raw));
}

test("valid inputs pass through unchanged", () => {
  const ok = (schema: (typeof schemas)[keyof typeof schemas], raw: unknown) =>
    assert.deepEqual(checkInput(schema, raw, () => assert.fail("should not reject")), raw);
  ok(schemas.foundTribe, { name: "حمير", sheikh: "حمير", trait: "guard", lineage: "aws" });
  ok(schemas.train, { kind: "infantry", qty: 10 });
  ok(schemas.attack, { targetKind: "bandit", targetId: "3", infantry: 4, cavalry: 0 });
  ok(schemas.barter, { give: "food", take: "wood", lots: 2 });
  ok(schemas.spot, { x: 0, y: 31 });
  ok(schemas.none, null);
  ok(schemas.reply, { id: 4, body: "حياك" });
});

test("NaN, Infinity, strings for numbers, wrong shapes and extra keys answer 400", () => {
  rejects(schemas.train, { kind: "infantry", qty: Number.NaN });
  rejects(schemas.train, { kind: "infantry", qty: "5" });
  rejects(schemas.train, { kind: "infantry", qty: 2.5 });
  rejects(schemas.attack, { targetKind: "mecca", targetId: "1", infantry: 1, cavalry: 0 });
  rejects(schemas.attack, { targetKind: "bandit", targetId: "1", infantry: Number.POSITIVE_INFINITY, cavalry: 0 });
  rejects(schemas.barter, { give: "food", take: "wood", lots: 0 });
  rejects(schemas.spot, { x: -1, y: 0 });
  rejects(schemas.spot, { x: 99, y: 0 });
  rejects(schemas.spot, { x: 1, y: 1, admin: true });
  rejects(schemas.slot, "1");
  rejects(schemas.foundTribe, { name: "x".repeat(500), sheikh: "a", trait: "guard" });
  rejects(schemas.foundTribe, null);
  rejects(schemas.letter, 42);
  rejects(schemas.none, { anything: 1 });
});

test("every POST server function validates its input with zod on the server", () => {
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  const blocks = api.split(/^export const /m).slice(1);
  const posts = blocks.filter((b) => b.includes('method: "POST"'));
  assert.ok(posts.length >= 20, `found ${posts.length}`);
  for (const block of posts) assert.match(block, /await valid\(schemas\.\w+, raw\)/, block.split(" ")[0]);
});
