/**
 * Real Better Auth on a throwaway in-memory PGlite: sign-up, the diwan owner
 * check, and the sign-in / sign-up rate limits per client IP.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.PGLITE_MEMORY = "1";
delete process.env.DATABASE_URL;
delete process.env.BETTER_AUTH_URL;
process.env.NODE_ENV = "test";

const db = await import("@/lib/db");
const { auth } = await import("@/lib/auth/server");
const { RENDER_PROXY_HOPS, withClientIp } = await import("@/lib/auth/client-ip");
const diwan = await import("./diwan.server");

const ORIGIN = "http://localhost:8080";

function call(path: string, body: unknown, headers: Record<string, string>) {
  const request = new Request(`${ORIGIN}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
  // Same wrapper the /api/auth/$ route uses, with Render's hop count.
  return withClientIp(request, RENDER_PROXY_HOPS).then((r) => auth.handler(r));
}

/** Headers as they reach the app on Render: `<client>, <Cloudflare edge>, <Render LB>`. */
const via = (ip: string, forged = "") => ({ "x-forwarded-for": `${forged ? `${forged}, ` : ""}${ip}, 172.71.195.123, 10.226.90.65` });

const signUp = (email: string, ip: string) =>
  call("/sign-up/email", { email, password: "kahf-marib-2026", name: "شيخ" }, via(ip));

test("an unverified account registered with the owner's email gets nothing; the documented SQL line grants the diwan", async () => {
  process.env.ADMIN_EMAIL = "owner@baad-marib.test";
  const res = await signUp("Owner@Baad-Marib.test", "203.0.113.10");
  assert.equal(res.status, 200, await res.clone().text());
  const sql = await db.getSql();
  const [user] = await sql`select id, "emailVerified" from "user" where lower(email) = 'owner@baad-marib.test'`;
  assert.equal(user.emailVerified, false, "email sign-up must not mark the address verified");
  const id = String(user.id);
  assert.equal((await diwan.gate(id)).steward, false);
  assert.deepEqual(await diwan.loadDiwan(id), { ok: false, error: "closed" });
  assert.equal(await diwan.replyLetter(id, 1, "رد"), "ليس هذا ديوانك.");

  // The exact line from docs/deploy.md, as DevOps will run it.
  const doc = readFileSync(new URL("../../../docs/deploy.md", import.meta.url), "utf8");
  const line = /<!-- owner-verify-sql -->\s*```sql\n(.+)\n```/.exec(doc)?.[1];
  assert.ok(line, "docs/deploy.md must carry the owner-verify SQL line");
  const pg = await db.getPglite();
  await pg.exec(line.replace("OWNER_EMAIL_HERE", "owner@baad-marib.test"));
  assert.equal((await diwan.gate(id)).steward, true);
  delete process.env.ADMIN_EMAIL;
});

test("sign-in is limited to 5 tries a minute per client IP", async () => {
  const wrong = (ip: Record<string, string>) =>
    call("/sign-in/email", { email: "nobody@baad-marib.test", password: "wrong-password" }, ip);
  const a = via("198.51.100.7");
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await wrong(a)).status);
  assert.deepEqual(statuses.slice(0, 5).includes(429), false, statuses.join(","));
  assert.equal(statuses[5], 429, statuses.join(","));
  // Counted in Postgres (survives restarts), keyed by the resolved IP.
  const sql = await db.getSql();
  const rows = await sql`select key from "rateLimit" where key like '%198.51.100.7%'`;
  assert.equal(rows.length, 1);
  // Another client is not affected.
  assert.notEqual((await wrong(via("198.51.100.8"))).status, 429);
});

test("a forged leftmost X-Forwarded-For or our own header cannot dodge the limit", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await call(
      "/sign-in/email",
      { email: "nobody@baad-marib.test", password: "wrong-password" },
      // A new fake address every time (leftmost XFF, CF-Connecting-IP, our own header),
      // but the hops Render's proxies append stay the same.
      { ...via("192.0.2.44", `10.9.9.${i}`), "cf-connecting-ip": `10.7.7.${i}`, "x-baad-client-ip": `10.8.8.${i}` },
    );
    statuses.push(res.status);
  }
  assert.equal(statuses[5], 429, statuses.join(","));
});

test("sign-up is limited to 5 accounts an hour per client IP", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await signUp(`p${i}@baad-marib.test`, "198.51.100.30")).status);
  assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.equal(statuses[5], 429);
});

test("a wrong password says so, instead of claiming the password is too short (QA #8)", async () => {
  const { arabicAuthError } = await import("./auth-errors");
  await signUp("rightpass@baad-marib.test", "198.51.100.50");
  const res = await call(
    "/sign-in/email",
    { email: "rightpass@baad-marib.test", password: "a-long-but-wrong-password" },
    via("198.51.100.51"),
  );
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code?: string; message?: string };
  const text = arabicAuthError({ ...body, status: res.status });
  assert.equal(text, "البريد أو كلمة السر غير صحيحة.");
  assert.doesNotMatch(text, /قصيرة/);
  const short = await call("/sign-up/email", { email: "s@baad-marib.test", password: "short", name: "x" }, via("198.51.100.52"));
  assert.equal(arabicAuthError({ ...((await short.json()) as object), status: short.status }), "كلمة السر قصيرة. ثمانية أحرف على الأقل.");
  assert.equal(arabicAuthError({ status: 429 }), "محاولات كثيرة. انتظر دقيقة ثم حاول.");
});

test("after sign-out, replaying ALL the old cookies is no longer a session (QA #6)", async () => {
  const up = await signUp("leaver@baad-marib.test", "198.51.100.60");
  assert.equal(up.status, 200);
  const jar = up.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  assert.match(jar, /session_token=/);
  const session = () => auth.api.getSession({ headers: new Headers({ cookie: jar }) });
  assert.ok((await session())?.user, "signed in before sign-out");
  const out = await call("/sign-out", {}, { cookie: jar, ...via("198.51.100.60") });
  assert.equal(out.status, 200);
  assert.equal(await session(), null, "the old cookies must not work after sign-out");
});
