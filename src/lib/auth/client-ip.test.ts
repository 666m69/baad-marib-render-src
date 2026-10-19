import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_IP_HEADER, resolveClientIp, withClientIp } from "./client-ip.ts";

const h = (init: Record<string, string>) => new Headers(init);

test("CF-Connecting-IP (set by Cloudflare in front of Render) wins", () => {
  assert.equal(resolveClientIp(h({ "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "203.0.113.5");
});

test("X-Forwarded-For is read from the right: the leftmost entry is client-controlled", () => {
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })), "203.0.113.9");
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }), 2), "203.0.113.9");
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
});

test("garbage is rejected instead of becoming a rate-limit key", () => {
  assert.equal(resolveClientIp(h({ "cf-connecting-ip": "not-an-ip" })), null);
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "1.1.1.1, evil" })), null);
  assert.equal(resolveClientIp(h({})), null);
  assert.equal(resolveClientIp(h({ "cf-connecting-ip": "2001:db8::1" })), "2001:db8::1");
});

test("a client-sent copy of our trusted header is dropped", () => {
  const forged = new Request("http://x/api/auth/sign-in/email", { headers: { [CLIENT_IP_HEADER]: "9.9.9.9" } });
  assert.equal(withClientIp(forged).headers.get(CLIENT_IP_HEADER), null);
  const real = new Request("http://x/", { headers: { [CLIENT_IP_HEADER]: "9.9.9.9", "x-forwarded-for": "9.9.9.9, 203.0.113.1" } });
  assert.equal(withClientIp(real).headers.get(CLIENT_IP_HEADER), "203.0.113.1");
});
