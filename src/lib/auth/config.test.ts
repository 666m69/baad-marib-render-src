import assert from "node:assert/strict";
import test from "node:test";
import { AuthConfigError, authSettings, isProduction } from "./config.ts";

const dev = () => "dev-secret-dev-secret-dev-secret-00";
const SECRET = "s".repeat(40);

test("production refuses to start without BETTER_AUTH_SECRET: no fallback secret", () => {
  for (const env of [
    { NODE_ENV: "production", BETTER_AUTH_URL: "https://baad-marib.onrender.com" },
    { DATABASE_URL: "postgres://x", BETTER_AUTH_URL: "https://baad-marib.onrender.com" },
    { NODE_ENV: "production", BETTER_AUTH_SECRET: "short", BETTER_AUTH_URL: "https://a.b" },
    { NODE_ENV: "production", BETTER_AUTH_SECRET: "   ", BETTER_AUTH_URL: "https://a.b" },
  ]) {
    let called = false;
    assert.throws(() => authSettings(env, () => ((called = true), dev())), AuthConfigError);
    assert.equal(called, false, "the dev secret must never be used in production");
  }
});

test("production requires an https BETTER_AUTH_URL", () => {
  assert.throws(() => authSettings({ NODE_ENV: "production", BETTER_AUTH_SECRET: SECRET }, dev), AuthConfigError);
  assert.throws(
    () => authSettings({ NODE_ENV: "production", BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: "http://a.b" }, dev),
    AuthConfigError,
  );
});

test("production uses exactly the configured secret and origin", () => {
  const s = authSettings(
    { NODE_ENV: "production", BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: "https://baad-marib.onrender.com/" },
    dev,
  );
  assert.equal(s.secret, SECRET);
  assert.equal(s.baseURL, "https://baad-marib.onrender.com");
  assert.deepEqual(s.trustedOrigins, ["https://baad-marib.onrender.com"]);
});

test("local dev (no DATABASE_URL, not production) gets a local secret and localhost origins", () => {
  assert.equal(isProduction({}), false);
  const s = authSettings({}, dev);
  assert.equal(s.secret, dev());
  assert.ok(s.trustedOrigins.includes("http://localhost:8080"));
});
