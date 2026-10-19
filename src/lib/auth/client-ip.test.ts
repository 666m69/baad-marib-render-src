import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CLIENT_IP_HEADER, RENDER_PROXY_HOPS, proxyHops, resolveClientIp, withClientIp } from "./client-ip.ts";

const h = (init: Record<string, string>) => new Headers(init);

test("CF-Connecting-IP is ignored: it is not Render's documented header and is spoofable off-path", () => {
  assert.equal(resolveClientIp(h({ "cf-connecting-ip": "203.0.113.5" })), null);
  assert.equal(resolveClientIp(h({ "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "203.0.113.5" })), "203.0.113.5");
  const src = readFileSync(new URL("./client-ip.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /headers\.get\("cf-connecting-ip"\)/i);
});

test("Render: the client is the X-Forwarded-For entry 3 from the right (client, Cloudflare edge, Render LB)", () => {
  const real = "81.97.145.24, 172.71.195.123, 10.226.90.65";
  assert.equal(resolveClientIp(h({ "x-forwarded-for": real }), RENDER_PROXY_HOPS), "81.97.145.24");
});

test("a forged X-Forwarded-For cannot pick the key: forged entries land further left", () => {
  for (const forged of ["6.6.6.6", "6.6.6.6, 7.7.7.7", "1.1.1.1, 2.2.2.2, 3.3.3.3, 4.4.4.4"]) {
    const xff = `${forged}, 81.97.145.24, 172.71.195.123, 10.226.90.65`;
    assert.equal(resolveClientIp(h({ "x-forwarded-for": xff }), RENDER_PROXY_HOPS), "81.97.145.24", forged);
  }
  // A chain shorter than the hops our proxies add was not written by them: no key at all.
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7" }), RENDER_PROXY_HOPS), null);
});

test("hops: TRUST_PROXY_HOPS wins, then 3 on Render (RENDER=true), else 1", () => {
  assert.equal(proxyHops({ TRUST_PROXY_HOPS: "2", RENDER: "true" }), 2);
  assert.equal(proxyHops({ RENDER: "true" }), 3);
  assert.equal(proxyHops({}), 1);
  assert.equal(proxyHops({ TRUST_PROXY_HOPS: "nope" }), 1);
  const yaml = readFileSync(new URL("../../../render.yaml", import.meta.url), "utf8");
  assert.match(yaml, /key: TRUST_PROXY_HOPS\s+value: "3"/);
});

test("X-Forwarded-For is read from the right with one local hop", () => {
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })), "203.0.113.9");
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }), 2), "203.0.113.9");
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
});

test("garbage is rejected instead of becoming a rate-limit key", () => {
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "1.1.1.1, evil" })), null);
  assert.equal(resolveClientIp(h({})), null);
  assert.equal(resolveClientIp(h({ "x-forwarded-for": "2001:db8::1" })), "2001:db8::1");
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
    headers: { "content-type": "application/json", "x-forwarded-for": "6.6.6.6, 203.0.113.3, 172.71.0.1, 10.0.0.1" },
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
  const copy = await withClientIp(like, RENDER_PROXY_HOPS);
  assert.equal(copy.method, "POST");
  assert.equal(copy.url, "http://x/api/auth/sign-in/email");
  assert.equal(copy.headers.get(CLIENT_IP_HEADER), "203.0.113.3");
  assert.deepEqual(await copy.json(), { a: 1 });
});
