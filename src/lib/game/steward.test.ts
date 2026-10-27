import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adminEmails, isSteward } from "./steward";

const owner = { id: "1", email: "Owner@Example.com", emailVerified: true };

test("steward only from ADMIN_EMAIL, case-insensitive, comma list", () => {
  assert.deepEqual(adminEmails(" a@x.com, B@y.com ,,"), ["a@x.com", "b@y.com"]);
  assert.equal(isSteward(owner, "owner@example.com"), true);
  assert.equal(isSteward(owner, "other@example.com, OWNER@example.com"), true);
});

test("no ADMIN_EMAIL means no steward at all", () => {
  assert.equal(isSteward(owner, undefined), false);
  assert.equal(isSteward(owner, ""), false);
});

test("an unverified account with the admin address is not a steward", () => {
  assert.equal(isSteward({ ...owner, emailVerified: false }, "owner@example.com"), false);
  assert.equal(isSteward({ id: "2", email: null, emailVerified: true }, "owner@example.com"), false);
  assert.equal(isSteward(null, "owner@example.com"), false);
});

test("the self-claim button and route are gone", () => {
  const route = readFileSync(new URL("../../routes/diwan.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("./diwan.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /ثبّتني صاحب الديوان|claimSteward/);
  assert.doesNotMatch(api, /claimSteward/);
  assert.doesNotMatch(server, /claimSteward|insert into stewards/);
});
