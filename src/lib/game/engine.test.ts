/**
 * Engine tests on a throwaway in-memory PGLite (PGLITE_MEMORY=1): real SQL,
 * real migrations, nothing written to /workspace/.data.
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.PGLITE_MEMORY = "1";
delete process.env.DATABASE_URL;

const db = await import("@/lib/db");
const engine = await import("./engine.server");
const balance = await import("./balance");

async function sql() {
  return db.getSql();
}

async function found(id: string, name: string) {
  const res = await engine.foundTribe(id, { name, sheikh: name, trait: "guard", lineage: "aws" });
  assert.ok(res.ok, res.ok ? "" : res.error);
  return res.world;
}

async function row(id: string) {
  const s = await sql();
  const rows = await s`select * from tribes where user_id = ${id}`;
  return rows[0] as Record<string, unknown>;
}

/** Make the next read tick again (reads are throttled to one tick per few seconds). */
async function dueTick() {
  const s = await sql();
  await s`update world_meta set last_tick = null where id = 1`;
}

test("attacking bandits keeps the beginner shield; attacking a tribe drops it", async () => {
  const world = await found("u-shield", "حمير");
  await found("u-other", "كندة");
  const s = await sql();
  await s`update tribes set infantry = 50, cavalry = 50 where user_id = 'u-shield'`;
  const before = await row("u-shield");
  assert.ok(before.peace_until, "starts shielded");
  const bandit = world.bandits[0];
  assert.ok(bandit, "the valley has bandits");
  const hit = await engine.attack("u-shield", { targetKind: "bandit", targetId: String(bandit.id), infantry: 5, cavalry: 0 });
  assert.ok(hit.ok, hit.ok ? "" : hit.error);
  let after = await row("u-shield");
  assert.equal(after.attacked, false);
  assert.ok(after.peace_until, "shield still up after attacking bandits");

  const other = await row("u-other");
  await s`update tribes set peace_until = null where user_id = 'u-other'`;
  const raid = await engine.attack("u-shield", { targetKind: "player", targetId: String(other.user_id), infantry: 5, cavalry: 0 });
  assert.ok(raid.ok, raid.ok ? "" : raid.error);
  after = await row("u-shield");
  assert.equal(after.attacked, true);
  assert.equal(after.peace_until, null);
});

test("slow production is not lost to frequent polling (fraction is banked)", async () => {
  await found("u-bank", "مذحج");
  const s = await sql();
  // Freeze everything but the clock: 12 polls, 8 seconds apart.
  const start = await row("u-bank");
  const world = await engine.loadWorld("u-bank");
  const rate = world.you!.rates.wood;
  assert.ok(rate > 0 && rate < 60, `wood rate ${rate}/min`);
  await s`update tribes set wood = 0, wood_bank = 0 where user_id = 'u-bank'`;
  for (let i = 0; i < 12; i++) {
    await s`update tribes set last_tick = now() - interval '8 seconds' where user_id = 'u-bank'`;
    await dueTick();
    await engine.loadWorld("u-bank");
  }
  const end = await row("u-bank");
  const expected = (rate * 96) / 60;
  assert.ok(Number(end.wood) >= Math.floor(expected) - 1, `wood ${end.wood}, expected ≈ ${expected}`);
  assert.ok(Number(end.wood) <= Math.ceil(expected), `wood ${end.wood}, expected ≈ ${expected}`);
  assert.ok(start);
});

test("production never passes the cap", async () => {
  await found("u-cap", "طيء");
  const s = await sql();
  const cap = balance.storageCap(0);
  await s`update buildings set level = 0 where user_id = 'u-cap' and kind = 'storehouse'`;
  await s`update tribes set water = ${cap - 1}, last_tick = now() - interval '2 hours' where user_id = 'u-cap'`;
  await dueTick();
  await engine.loadWorld("u-cap");
  const r = await row("u-cap");
  assert.equal(Number(r.water), cap);
  assert.equal(Number(r.water_bank), 0);
});

test("guide and oath rewards refuse to overflow; nothing is credited past the cap", async () => {
  await found("u-reward", "بجيلة");
  const s = await sql();
  const gcap = balance.goldCap(1);
  await s`update tribes set gold = ${gcap} where user_id = 'u-reward'`;
  for (const kind of ["camp", "pasture", "well", "farm", "scout", "saalik", "market"]) {
    await engine.claimGuide("u-reward", kind);
  }
  for (const kind of ["well", "host", "scout"]) await engine.claimOath("u-reward", kind);
  const r = await row("u-reward");
  assert.ok(Number(r.gold) <= gcap, `gold ${r.gold} > ${gcap}`);
});

test("barter cannot push a good past its cap", async () => {
  await found("u-barter", "همدان");
  const s = await sql();
  const cap = balance.storageCap(0);
  await s`update buildings set level = 0 where user_id = 'u-barter' and kind = 'storehouse'`;
  await s`update tribes set wood = ${cap - 1}, food = 2000 where user_id = 'u-barter'`;
  const res = await engine.barter("u-barter", { give: "food", take: "wood", lots: 5 });
  assert.equal(res.ok, false);
  assert.ok(Number((await row("u-barter")).wood) <= cap);
});

test("NaN or non-numeric counts are rejected by the engine, not passed to SQL", async () => {
  await found("u-nan", "عك");
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "5" as unknown as number]) {
    const t = await engine.train("u-nan", "infantry", bad);
    assert.equal(t.ok, false);
    const b = await engine.barter("u-nan", { give: "food", take: "wood", lots: bad });
    assert.equal(b.ok, false);
    const a = await engine.attack("u-nan", { targetKind: "bandit", targetId: "1", infantry: bad, cavalry: bad });
    assert.equal(a.ok, false);
  }
});

test("concurrent requests are serialized by the valley lock (no lost updates, no errors)", async () => {
  await found("u-race", "الأشعريون");
  const s = await sql();
  await s`update tribes set wood = 1000, stone = 1000, food = 1000, water = 1000 where user_id = 'u-race'`;
  const results = await Promise.all([
    ...Array.from({ length: 6 }, () => engine.loadWorld("u-race")),
    ...Array.from({ length: 6 }, () => engine.barter("u-race", { give: "food", take: "wood", lots: 1 })),
  ]);
  assert.equal(results.length, 12);
  const r = await row("u-race");
  const trades = Number(r.trades);
  assert.equal(Number(r.food), 1000 - trades * balance.BARTER_GIVE);
});

test("diwan: only a verified ADMIN_EMAIL account is steward; there is no self-claim", async () => {
  const s = await sql();
  const diwan = await import("./diwan.server");
  assert.equal("claimSteward" in diwan, false);
  process.env.ADMIN_EMAIL = "owner@example.com";
  await s`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
          values ('u-fake', 'x', 'OWNER@example.com', false, now(), now()),
                 ('u-owner', 'y', 'owner2@example.com', true, now(), now()),
                 ('u-player', 'z', 'player@example.com', true, now(), now())`;
  await s`update "user" set email = 'owner@example.com' where id = 'u-owner'`;
  // Unverified sign-up with the admin address: not a steward.
  assert.equal((await diwan.gate("u-fake")).steward, false);
  assert.deepEqual(await diwan.loadDiwan("u-fake"), { ok: false, error: "closed" });
  // Ordinary verified player: not a steward, even though the board has no steward yet.
  assert.equal((await diwan.gate("u-player")).steward, false);
  assert.equal(await diwan.replyLetter("u-player", 1, "رد مزور"), "ليس هذا ديوانك.");
  // A stale row in the old stewards table grants nothing.
  await s`insert into stewards (user_id) values ('u-player') on conflict do nothing`;
  assert.equal((await diwan.gate("u-player")).steward, false);
  // The verified owner of ADMIN_EMAIL is the steward.
  assert.equal((await diwan.gate("u-owner")).steward, true);
  assert.equal((await diwan.loadDiwan("u-owner")).ok, true);
  delete process.env.ADMIN_EMAIL;
  assert.equal((await diwan.gate("u-owner")).steward, false, "removing ADMIN_EMAIL removes access");
});

test("the founding report names a documented or fictional poet, never a Companion", async () => {
  await found("u-poet", "الأوس الجدد");
  const s = await sql();
  const reports = await s`select body from reports where user_id = 'u-poet'`;
  const text = reports.map((r) => String(r.body)).join("\n");
  assert.match(text, /أحيحة بن الجلاح/);
  assert.doesNotMatch(text, /حسان بن ثابت|كعب بن مالك/);
});
