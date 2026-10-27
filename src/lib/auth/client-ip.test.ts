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

test("a client-sent copy of our trusted header is dropped", async () => {
  const forged = new Request("http://x/api/auth/sign-in/email", { headers: { [CLIENT_IP_HEADER]: "9.9.9.9" } });
  assert.equal((await withClientIp(forged)).headers.get(CLIENT_IP_HEADER), null);
  const real = new Request("http://x/", { headers: { [CLIENT_IP_HEADER]: "9.9.9.9", "x-forwarded-for": "9.9.9.9, 203.0.113.1" } });
  assert.equal((await withClientIp(real)).headers.get(CLIENT_IP_HEADER), "203.0.113.1");
});

test("the copy keeps method, URL and body, and works on a non-native Request-like object", async () => {
  const native = new Request("http://x/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.3" },
    body: JSON.stringify({ a: 1 }),
  });
  // Shaped like the production server's request object: not an undici Request.
  const like = {
    url: native.url,
    method: native.method,
    headers: native.headers,
    redirect: "follow",
    arrayBuffer: () => native.arrayBuffer(),
  } as unknown as Request;
  const copy = await withClientIp(like);
  assert.equal(copy.method, "POST");
  assert.equal(copy.url, "http://x/api/auth/sign-in/email");
  assert.equal(copy.headers.get(CLIENT_IP_HEADER), "203.0.113.3");
  assert.deepEqual(await copy.json(), { a: 1 });
});
