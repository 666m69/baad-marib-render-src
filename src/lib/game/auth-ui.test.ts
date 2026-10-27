import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("email-only login: no third-party sign-in anywhere in the auth stack", () => {
  for (const file of ["../../components/game/AuthScreen.tsx", "../auth/gates.tsx", "../auth/client.ts", "../auth/server.ts"]) {
    const text = read(file);
    assert.doesNotMatch(text, /genericOAuth|oauth2|SIGN_IN_PROVIDERS|socialProviders|bearer\(/i, file);
  }
  assert.match(read("../auth/server.ts"), /emailAndPassword: \{ enabled: true \}/);
});

test("accounts are never auto-linked to another identity", () => {
  assert.match(read("../auth/server.ts"), /accountLinking: \{ enabled: false \}/);
});
