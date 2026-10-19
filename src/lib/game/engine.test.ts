/**
 * Engine tests on a throwaway in-memory PGLite (PGLITE_MEMORY=1): real SQL,
 * real migrations, nothing written to .data/.
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

test("founding refuses profane or staff-posing names, for the tribe and the sheikh", async () => {
  const bad = await engine.foundTribe("u-bad", { name: "صـاحب الديوان", sheikh: "سيف", trait: "guard", lineage: "aws" });
  assert.equal(bad.ok, false);
  const badSheikh = await engine.foundTribe("u-bad", { name: "همدان", sheikh: "Adm1n", trait: "guard", lineage: "aws" });
  assert.equal(badSheikh.ok, false);
  assert.equal(await row("u-bad"), undefined);
  await found("u-good", "خولان");
});

test("two players polling every 5 s for one simulated minute earn a full minute of production (QA S1 #1)", async () => {
  await found("u-poll-a", "بنو الرمل");
  await found("u-poll-b", "بنو الحصى");
  const s = await sql();
  const goods = ["water", "food", "gold", "wood", "stone"] as const;
  const ids = ["u-poll-a", "u-poll-b"];
  const milli = (r: Record<string, unknown>, g: string) => Number(r[g]) * balance.BANK_SCALE + Number(r[`${g}_bank`]);
  await s`update tribes set last_tick = now() where user_id in ('u-poll-a', 'u-poll-b')`;
  const before = new Map(await Promise.all(ids.map(async (id) => [id, await row(id)] as const)));
  const started = Date.now();
  for (let step = 0; step < 12; step++) {
    // Five seconds pass...
    await s`update tribes set last_tick = last_tick - interval '5 seconds' where user_id in ('u-poll-a', 'u-poll-b')`;
    await dueTick();
    // ...both players poll (the second read is throttled, as in production), and
    // A reads again a few milliseconds later: the pattern that used to reset the
    // fraction and leave production at zero.
    await engine.loadWorld("u-poll-a");
    await engine.loadWorld("u-poll-b");
    await dueTick();
    await engine.loadWorld("u-poll-a");
  }
  const wallSec = (Date.now() - started) / 1000;
  for (const id of ids) {
    const world = await engine.loadWorld(id);
    assert.ok(world.you, id);
    const rates = world.you.rates as unknown as Record<string, number>;
    const now = await row(id);
    for (const g of goods) {
      const got = (milli(now, g) - milli(before.get(id)!, g)) / balance.BANK_SCALE;
      const minute = rates[g];
      assert.ok(minute > 0, `${id} ${g} rate`);
      // At least a full minute (less rounding), at most a minute plus the real time the test took.
      assert.ok(got >= minute - 0.1, `${id} ${g}: got ${got}, a minute is ${minute}`);
      assert.ok(got <= (minute * (60 + wallSec + 1)) / 60, `${id} ${g}: got ${got}, a minute is ${minute}`);
    }
  }
});

test("a look-alike of a taken tribe name is refused: hidden marks, tatweel, spacing, alef forms (QA #10)", async () => {
  await found("u-sarab", "بنو السراب");
  for (const copy of ["بنو\u202Eالسراب", "بنوالسراب", "بنـو السـراب", "بَنُو السَّرَاب", "بنو  السراب"]) {
    const res = await engine.foundTribe("u-copy", { name: copy, sheikh: "سيف", trait: "guard", lineage: "aws" });
    assert.equal(res.ok, false, copy);
  }
  await found("u-alef", "آل ناعط");
  const res = await engine.foundTribe("u-copy", { name: "ال ناعط", sheikh: "سيف", trait: "guard", lineage: "aws" });
  assert.equal(res.ok, false);
  assert.equal(await row("u-copy"), undefined);
});

test("a battle report against «بنو …» reads «نصر على بني …» / «هزيمة أمام بني …» (QA #17)", async () => {
  await found("u-gram-a", "كهلان");
  await found("u-gram-b", "بنو العقيق");
  const s = await sql();
  await s`update tribes set peace_until = null, infantry = 200, cavalry = 50 where user_id = 'u-gram-a'`;
  await s`update tribes set peace_until = null where user_id = 'u-gram-b'`;
  const res = await engine.attack("u-gram-a", { targetKind: "player", targetId: "u-gram-b", infantry: 200, cavalry: 50 } as never);
  assert.ok(res.ok, res.ok ? "" : res.error);
  await s`update marches set arrive_at = now() - interval '1 second' where attacker_id = 'u-gram-a'`;
  await dueTick();
  await engine.loadWorld("u-gram-a");
  const reports = await s`select title, body from reports where user_id = 'u-gram-a' and kind <> 'found'`;
  const text = reports.map((r) => `${r.title} ${r.body}`).join("\n");
  assert.match(text, /(على|أمام) بني العقيق/, text);
  assert.doesNotMatch(text, /(على|أمام|من|مع) بنو العقيق/, text);
});

async function stockOf(id: string) {
  const r = await row(id);
  return { water: Number(r.water), food: Number(r.food), gold: Number(r.gold), wood: Number(r.wood), stone: Number(r.stone) };
}

/** Keep bandits out of a raid test: only the raid may move goods. */
async function isolate(...ids: string[]) {
  const s = await sql();
  await s`delete from bandits`;
  await s`update world_meta set last_spawn = now(), last_tick = now() where id = 1`;
  for (const id of ids) await s`update tribes set last_raid_at = now() where user_id = ${id}`;
}

async function raidOnce(attacker: string, defender: string, infantry: number, cavalry: number) {
  const s = await sql();
  const res = await engine.attack(attacker, { targetKind: "player", targetId: defender, infantry, cavalry } as never);
  assert.ok(res.ok, res.ok ? "" : res.error);
  await s`update marches set arrive_at = now() - interval '1 second' where attacker_id = ${attacker} and status = 'march'`;
  await dueTick();
  await engine.loadWorld(attacker);
}

test("PvP loot: the defender loses only what the attacker can carry and store; the excess stays home; totals conserved", async () => {
  await found("u-loot-a", "كهلان الجدد");
  await found("u-loot-d", "بنو المزن");
  const s = await sql();
  const goods = ["water", "food", "gold", "wood", "stone"] as const;
  // Attacker almost full: 10 food of room, no gold room. Big army, rich defender.
  await s`update tribes set peace_until = null, infantry = 400, cavalry = 100, food = 2990, gold = 3000, water = 0, wood = 0, stone = 0 where user_id = 'u-loot-a'`;
  await s`update tribes set peace_until = null, infantry = 0, cavalry = 0, food = 2000, gold = 2000, water = 1000, wood = 1000, stone = 1000 where user_id = 'u-loot-d'`;
  await isolate("u-loot-a", "u-loot-d");
  const a0 = await stockOf("u-loot-a");
  const d0 = await stockOf("u-loot-d");
  await raidOnce("u-loot-a", "u-loot-d", 400, 100);
  const a1 = await stockOf("u-loot-a");
  const d1 = await stockOf("u-loot-d");
  // Production during the test is a few units at most; measure transfer from the defender side.
  const gained = Object.fromEntries(goods.map((g) => [g, a1[g] - a0[g]]));
  const lost = Object.fromEntries(goods.map((g) => [g, d0[g] - d1[g]]));
  assert.ok(lost.food <= 10 + 1, `food room was 10, defender lost ${lost.food}`);
  assert.equal(lost.gold <= 0, true, `no gold room: defender must keep its gold (lost ${lost.gold})`);
  assert.ok(lost.water > 0 || lost.wood > 0 || lost.stone > 0, "goods with room are taken");
  for (const g of goods) assert.ok(Math.abs(gained[g] - Math.max(0, lost[g])) <= 1, `${g}: attacker +${gained[g]}, defender -${lost[g]}`);
  const reports = await s`select body from reports where user_id = 'u-loot-a' and kind = 'attack' order by id desc limit 1`;
  const body = String(reports[0]?.body);
  assert.match(body, /بقي عند بني المزن .*ذهب لضيق بيت المال/, body);
  assert.doesNotMatch(body, /ضاع/, body);
  const def = await s`select body from reports where user_id = 'u-loot-d' and kind = 'defense' order by id desc limit 1`;
  assert.match(String(def[0]?.body), /بقي لك .*لضيق بيت مالهم/);
});

test("PvP loot with free room: the attacker gets exactly what the defender loses, limited by carry", async () => {
  await found("u-carry-a", "همدان الجدد");
  await found("u-carry-d", "بنو الوشل");
  const s = await sql();
  await s`update tribes set peace_until = null, infantry = 20, cavalry = 0, food = 0, gold = 0, water = 0, wood = 0, stone = 0 where user_id = 'u-carry-a'`;
  await s`update tribes set peace_until = null, infantry = 0, cavalry = 0, food = 2000, gold = 2000, water = 2000, wood = 2000, stone = 2000 where user_id = 'u-carry-d'`;
  await isolate("u-carry-a", "u-carry-d");
  const d0 = await stockOf("u-carry-d");
  const a0 = await stockOf("u-carry-a");
  await raidOnce("u-carry-a", "u-carry-d", 20, 0);
  const d1 = await stockOf("u-carry-d");
  const a1 = await stockOf("u-carry-a");
  const goods = ["water", "food", "gold", "wood", "stone"] as const;
  const moved = goods.reduce((n, g) => n + (d0[g] - d1[g]), 0);
  const carry = balance.carryOf(20, 0);
  assert.ok(moved > 0 && moved <= carry, `moved ${moved}, carry ${carry}`);
  for (const g of goods) assert.ok(Math.abs(a1[g] - a0[g] - (d0[g] - d1[g])) <= 1, g);
});

test("bandit raid on a tribe: what the tribe loses lands in the den's hoard (nothing vanishes)", async () => {
  await found("u-den", "بنو الرهق");
  const s = await sql();
  const me = await row("u-den");
  await s`delete from bandits`;
  await s`insert into bandits (x, y, tier, infantry, cavalry, gold, food, water, wood, stone)
          values (${Number(me.x) + 1}, ${Number(me.y)}, 3, 300, 100, 0, 0, 0, 0, 0)`;
  await s`update tribes set peace_until = null, last_raid_at = null, infantry = 0, cavalry = 0,
          food = 2000, gold = 2000, water = 2000, wood = 2000, stone = 2000 where user_id = 'u-den'`;
  const before = await stockOf("u-den");
  await dueTick();
  await engine.loadWorld("u-den");
  const after = await stockOf("u-den");
  const [den] = await s`select * from bandits`;
  assert.ok(den, "the den survives the raid");
  let taken = 0;
  for (const g of ["water", "food", "gold", "wood", "stone"] as const) {
    const lost = before[g] - after[g];
    // the tribe also produced a little during the read; never more than 2 per good here
    assert.ok(Math.abs(Number(den[g]) - Math.max(0, lost)) <= 2, `${g}: tribe -${lost}, den +${den[g]}`);
    taken += Number(den[g]);
  }
  assert.ok(taken > 0, "the raid took something");
  assert.ok(taken <= balance.carryOf(Number(den.infantry), Number(den.cavalry)));
});

test("raiding a bandit den with a full بيت المال: the gold is not credited and the report says it stayed in the den", async () => {
  await found("u-den-a", "بنو الغيل");
  const s = await sql();
  const me = await row("u-den-a");
  await isolate("u-den-a");
  const [den] = await s`insert into bandits (x, y, tier, infantry, cavalry, gold, food, water, wood, stone)
          values (${Number(me.x) + 1}, ${Number(me.y) + 1}, 1, 1, 0, 500, 500, 0, 0, 0) returning id`;
  await s`update tribes set peace_until = null, infantry = 200, cavalry = 0, gold = 3000, food = 0 where user_id = 'u-den-a'`;
  const gold0 = Number((await row("u-den-a")).gold);
  const res = await engine.attack("u-den-a", { targetKind: "bandit", targetId: String(den.id), infantry: 200, cavalry: 0 } as never);
  assert.ok(res.ok, res.ok ? "" : res.error);
  await s`update marches set arrive_at = now() - interval '1 second' where attacker_id = 'u-den-a' and status = 'march'`;
  await dueTick();
  await engine.loadWorld("u-den-a");
  const after = await row("u-den-a");
  assert.equal(Number(after.gold), gold0, "no gold room: nothing credited");
  assert.ok(Number(after.food) > 0, "food had room and was carried");
  const [rep] = await s`select body from reports where user_id = 'u-den-a' and kind <> 'found' order by id desc limit 1`;
  assert.match(String(rep.body), /بقي في الوكر .*ذهب لضيق بيت المال/, String(rep.body));
  assert.doesNotMatch(String(rep.body), /ضاع/);
});

// ---- QA PR #3 N3: a beaten den / صعلوك that still holds loot is not deleted ----

async function marchNow(attacker: string) {
  const s = await sql();
  await s`update marches set arrive_at = now() - interval '1 second' where attacker_id = ${attacker} and status = 'march'`;
  await dueTick();
  await engine.loadWorld(attacker);
}

test("N3: a den beaten by a raider with full stores stays on the map with every good it did not lose", async () => {
  await found("u-n3-a", "بنو الوهط");
  const s = await sql();
  const me = await row("u-n3-a");
  await isolate("u-n3-a");
  const [den] = await s`insert into bandits (x, y, tier, infantry, cavalry, gold, food, water, wood, stone)
          values (${Number(me.x) + 1}, ${Number(me.y) - 1}, 1, 1, 0, 400, 300, 200, 100, 50) returning id`;
  // Full بيت المال and full stores except a little food room.
  await s`update tribes set peace_until = null, infantry = 200, cavalry = 0, gold = 3000, water = 3000, wood = 3000, stone = 3000, food = 2990 where user_id = 'u-n3-a'`;
  const before = await stockOf("u-n3-a");
  const res = await engine.attack("u-n3-a", { targetKind: "bandit", targetId: String(den.id), infantry: 200, cavalry: 0 } as never);
  assert.ok(res.ok, res.ok ? "" : res.error);
  await marchNow("u-n3-a");
  const [kept] = await s`select * from bandits where id = ${den.id}`;
  assert.ok(kept, "the den with goods left is not deleted");
  assert.equal(Number(kept.infantry) + Number(kept.cavalry), 0, "its guards are gone");
  assert.equal(Number(kept.gold), 400, "no gold room: all the gold stays in the den");
  const after = await stockOf("u-n3-a");
  const gotFood = after.food - before.food;
  assert.ok(gotFood >= 0 && gotFood <= 11, `food room was 10, got ${gotFood}`);
  assert.ok(Math.abs(Number(kept.food) - (300 - gotFood)) <= 1, `den food ${kept.food} + carried ${gotFood} = 300`);
  const [rep] = await s`select body from reports where user_id = 'u-n3-a' and kind = 'attack' order by id desc limit 1`;
  assert.match(String(rep.body), /بقي في الوكر/);
  assert.match(String(rep.body), /الوكر باقٍ بلا حرس/);
});

test("N3: a guardless den gives up everything that fits, and is removed once empty", async () => {
  await found("u-n3-b", "بنو القاع");
  const s = await sql();
  const me = await row("u-n3-b");
  await isolate("u-n3-b");
  const [den] = await s`insert into bandits (x, y, tier, infantry, cavalry, gold, food, water, wood, stone)
          values (${Number(me.x) - 1}, ${Number(me.y) + 1}, 1, 0, 0, 40, 30, 20, 10, 5) returning id`;
  await s`update tribes set peace_until = null, infantry = 100, cavalry = 0, gold = 0, water = 0, wood = 0, stone = 0, food = 0 where user_id = 'u-n3-b'`;
  const renown0 = Number((await row("u-n3-b")).renown);
  const res = await engine.attack("u-n3-b", { targetKind: "bandit", targetId: String(den.id), infantry: 100, cavalry: 0 } as never);
  assert.ok(res.ok, res.ok ? "" : res.error);
  await marchNow("u-n3-b");
  const left = await s`select * from bandits where id = ${den.id}`;
  assert.equal(left.length, 0, "empty and unguarded: the den is gone");
  const after = await stockOf("u-n3-b");
  assert.ok(after.gold >= 40 && after.food >= 30 && after.water >= 20 && after.wood >= 10 && after.stone >= 5, JSON.stringify(after));
  assert.equal(Number((await row("u-n3-b")).renown), renown0, "no renown for looting an unguarded den");
});

test("N3: a صعلوك beaten while the raider's بيت المال is full keeps his gold and stays", async () => {
  await found("u-n3-c", "بنو الحزن");
  const s = await sql();
  const me = await row("u-n3-c");
  await isolate("u-n3-c");
  await s`delete from saalik`;
  const [man] = await s`insert into saalik (name, line, x, y, cavalry, gold, food)
          values ('الخليع', 'سطر', ${Number(me.x) + 1}, ${Number(me.y) + 1}, 1, 90, 60) returning id`;
  await s`update tribes set peace_until = null, infantry = 200, cavalry = 0, gold = 3000, food = 3000 where user_id = 'u-n3-c'`;
  const res = await engine.attack("u-n3-c", { targetKind: "saalik", targetId: String(man.id), infantry: 200, cavalry: 0 } as never);
  assert.ok(res.ok, res.ok ? "" : res.error);
  await s`update world_meta set last_spawn = now() where id = 1`;
  await marchNow("u-n3-c");
  const [kept] = await s`select * from saalik where id = ${man.id}`;
  assert.ok(kept, "the صعلوك with gold left is not deleted");
  assert.equal(Number(kept.cavalry), 0);
  assert.equal(Number(kept.gold), 90);
  assert.equal(Number(kept.food), 60);
  const [rep] = await s`select body from reports where user_id = 'u-n3-c' and kind = 'attack' order by id desc limit 1`;
  assert.match(String(rep.body), /الصعلوك باقٍ بلا فرسان/);
});

test("N3: an ambushing den wiped out on the road keeps the hoard it already held", async () => {
  await found("u-n3-d", "بنو السهب");
  const s = await sql();
  const me = await row("u-n3-d");
  await isolate("u-n3-d");
  const dir = Number(me.x) < balance.WORLD / 2 ? 1 : -1;
  const [target] = await s`insert into bandits (x, y, tier, infantry, cavalry, gold, food, water, wood, stone)
          values (${Number(me.x) + 6 * dir}, ${Number(me.y)}, 1, 1, 0, 0, 0, 0, 0, 0) returning id`;
  const [ambusher] = await s`insert into bandits (x, y, tier, infantry, cavalry, gold, food, water, wood, stone)
          values (${Number(me.x) + 3 * dir}, ${Number(me.y)}, 1, 1, 0, 77, 66, 55, 44, 33) returning id`;
  await s`update tribes set peace_until = null, infantry = 300, cavalry = 0 where user_id = 'u-n3-d'`;
  const res = await engine.attack("u-n3-d", { targetKind: "bandit", targetId: String(target.id), infantry: 300, cavalry: 0 } as never);
  assert.ok(res.ok, res.ok ? "" : res.error);
  await marchNow("u-n3-d");
  const [rep] = await s`select title from reports where user_id = 'u-n3-d' and kind = 'ambush' order by id desc limit 1`;
  assert.ok(rep, "the march was ambushed");
  const [den] = await s`select * from bandits where id = ${ambusher.id}`;
  assert.ok(den, "the wiped-out ambusher still holds goods, so it stays");
  assert.equal(Number(den.infantry) + Number(den.cavalry), 0);
  assert.deepEqual([den.gold, den.food, den.water, den.wood, den.stone].map(Number), [77, 66, 55, 44, 33]);
});

test("N3: the engine deletes dens and صعاليك only through the guards-and-goods check", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./engine.server.ts", import.meta.url), "utf8");
  assert.equal(src.match(/delete from bandits/g)?.length, 1, "only settleDen deletes a den");
  // settleSaalik, plus hireSaalik (he rides off with the tribe that hired him, purse paid).
  assert.equal(src.match(/delete from saalik/g)?.length, 2);
  assert.equal(balance.keepsHoard(0, { water: 0, food: 1, gold: 0, wood: 0, stone: 0 }), true);
  assert.equal(balance.keepsHoard(0, { water: 0, food: 0, gold: 0, wood: 0, stone: 0 }), false);
  assert.equal(balance.keepsHoard(3, { water: 0, food: 0, gold: 0, wood: 0, stone: 0 }), true);
  assert.deepEqual(balance.hoardLeft({ water: 5, food: 5, gold: 5, wood: 5, stone: 5 }, { water: 5, food: 2, gold: 0, wood: 9, stone: 0 }), { water: 0, food: 3, gold: 5, wood: 0, stone: 5 });
  assert.equal(balance.hoardShare(0), 1);
  assert.equal(balance.hoardShare(4), balance.LOOT_SHARE);
});

test("N1/N2: founding a tribe named «الكعبة», «الله أكبر», «Muhammad» or only tatweel is refused", async () => {
  for (const name of ["الكعبة", "الله أكبر", "Muhammad", "سبحانالله", "ـــــ", "ٮنو مكة"]) {
    const res = await engine.foundTribe(`u-n1-${name.length}-${name.codePointAt(0)}`, { name, sheikh: "قيس", trait: "guard", lineage: "aws" });
    assert.equal(res.ok, false, name);
  }
  const sheikh = await engine.foundTribe("u-n1-sheikh", { name: "بنو الجرف", sheikh: "كعب بن مالك", trait: "guard", lineage: "aws" });
  assert.equal(sheikh.ok, false, "the sheikh (player) name goes through the same list");
});
