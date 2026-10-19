import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SIGN_IN_PROVIDERS } from "../auth/providers";

test("email-only login: no Google or X buttons are offered", () => {
  assert.equal(SIGN_IN_PROVIDERS.length, 0);
  for (const file of ["../../components/game/AuthScreen.tsx", "../auth/gates.tsx"]) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(text, /GROK_PROVIDERS\.map/, file);
  }
});

test("OAuth identities never link to an unverified local account", () => {
  const server = readFileSync(new URL("../auth/server.ts", import.meta.url), "utf8");
  assert.match(server, /requireLocalEmailVerified: true/);
});
