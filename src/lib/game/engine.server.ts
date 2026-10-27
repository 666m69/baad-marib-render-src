import { getSql, type Sql } from "@/lib/db";
import {
  AMBUSH_RANGE,
  BANDIT_MAX,
  BANDIT_MIN,
  BANDIT_SPAWN_SEC,
  BARTER_GIVE,
  BARTER_MAX_LOTS,
  BUILDING_KINDS,
  BUILDINGS,
  MAX_ACCRUE_SEC,
  MAX_PEACE_AHEAD_MS,
  MAX_SANCTUARY,
  PEOPLE_FOOD_GATE,
  PEACE_EXTEND_MIN,
  RAID_COOLDOWN_SEC,
  RAID_RANGE,
  STUDY_KINDS,
  STUDIES,
  SAALIK_MAX,
  SHEIKH_NAMES,
  SHEIKH_TRAITS,
  START,
  WORLD,
  applyStudies,
  armyCap,
  armyPower,
  banditKit,
  banditLabel,
  carryOf,
  chebyshev,
  clockOf,
  defenseOf,
  distance,
  emptyStudyFlags,
  FIELD_MAX,
  FIELD_SLOTS,
  fieldCost,
  GUIDE_REWARD,
  inBounds,
  isGood,
  isGuideKind,
  isNight,
  isOathKind,
  isSheikhTrait,
  lineageBy,
  lootHint,
  moveQuote,
  paceOf,
  peopleCap,
  peopleGrowMs,
  powerBand,
  peaceExtendCost,
  playedTrait,
  pastureBoost,
  ratesPerMin,
  resolveBattle,
  saalikOffer,
  scoutSeconds,
  SCOUT_GOLD,
  SCOUT_HOLD_MIN,
  storageCap,
  poetLine,
  attackDropsShield,
  capsOf,
  emptyLevels,
  spillNote,
  studyOpen,
  takeLoot,
  traitFactor,
  trainQuote,
  upgradeCost,
  workSeconds,
  barterTake,
  type BuildingKind,
  type Cost,
  type FieldGood,
  type Good,
  type GuideKind,
  type OathKind,
  type SheikhTrait,
  type Stock,
  type StudyFlags,
  type StudyKind,
  type TroopKind,
} from "./balance";
import {
  SPOIL_HOLD_SEC,
  bestPastureNeighbor,
  cellKey,
  chainLimit,
  claimCost,
  claimSteps,
  evaluatePastures,
  pastureBase,
  sampleMarchCell,
  type PastureAnchor,
  type PastureClaim,
  type PastureIntruder,
  type PastureState,
} from "./pasture";
import type { BuildingView, ChainView, FieldView, GameResult, IntelView, OathView, PublicBandit, PublicCamp, PublicClash, PublicMarch, PublicPasture, PublicSaalik, ReportView, StudyView, WorldSnapshot, YouState } from "./types";

type Row = Record<string, unknown>;

let chain: Promise<void> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

function epoch(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function flag(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1;
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function cleanName(raw: string) {
  const name = raw.replace(/[\u200B-\u200F\u202A-\u202E]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 18) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(name)) return null;
  return name;
}

function key(x: number, y: number) {
  return `${x},${y}`;
}

function pastureYield(states: PastureState[], userId: string, lineage: unknown) {
  const sum = { water: 0, food: 0, wood: 0, stone: 0 };
  for (const state of states) {
    if (state.userId !== userId || !state.good || state.yield <= 0) continue;
    sum[state.good] += state.yield;
  }
  return {
    water: pastureBoost(lineage, sum.water),
    food: pastureBoost(lineage, sum.food),
    wood: pastureBoost(lineage, sum.wood),
    stone: pastureBoost(lineage, sum.stone),
  };
}

function publishPastures(states: PastureState[], viewer: string): PublicPasture[] {
  const groups = new Map<string, PastureState[]>();
  for (const state of states) {
    const id = cellKey(state.x, state.y);
    const list = groups.get(id) ?? [];
    list.push(state);
    groups.set(id, list);
  }
  const published: PublicPasture[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    if (!first) continue;
    const mine = list.find((state) => state.userId === viewer);
    const dispute = list.length > 1;
    const shown = mine ?? first;
    published.push({
      x: first.x,
      y: first.y,
      own: Boolean(mine),
      foreign: list.some((state) => state.userId !== viewer),
      dispute,
      silent: dispute || !shown.producing,
      bridge: Boolean(mine?.bridge),
      good: shown.good,
      rate: shown.rate,
      reason: dispute ? "dispute" : shown.reason,
    });
  }
  return published;
}

async function readPastures(sql: Sql, now: number) {
  const tribes = await sql<Row>`select user_id, x, y, cavalry, renown from tribes`;
  const claimRows = await sql<Row>`select user_id, x, y, claimed_at from pastures`;
  const banditRows = await sql<Row>`select x, y from bandits`;
  const saalikRows = await sql<Row>`select x, y from saalik`;
  const marchRows = await sql<Row>`
    select attacker_id, from_x, from_y, to_x, to_y, depart_at, arrive_at, status
    from marches
    where status in ('march', 'return', 'occupy')
  `;
  const anchors: PastureAnchor[] = tribes.map((row) => ({
    userId: String(row.user_id),
    x: num(row.x),
    y: num(row.y),
    cavalry: num(row.cavalry),
    renown: num(row.renown),
  }));
  const claims: PastureClaim[] = [];
  for (const row of claimRows) {
    const at = epoch(row.claimed_at) ?? 0;
    claims.push({ userId: String(row.user_id), x: num(row.x), y: num(row.y), at });
  }
  const intruders: PastureIntruder[] = [];
  for (const row of banditRows) intruders.push({ x: num(row.x), y: num(row.y), userId: "" });
  for (const row of saalikRows) intruders.push({ x: num(row.x), y: num(row.y), userId: "" });
  for (const row of marchRows) {
    const status = String(row.status);
    const cell =
      status === "occupy"
        ? { x: num(row.to_x), y: num(row.to_y) }
        : sampleMarchCell(
            num(row.from_x),
            num(row.from_y),
            num(row.to_x),
            num(row.to_y),
            epoch(row.depart_at) ?? now,
            epoch(row.arrive_at) ?? now,
            now,
          );
    intruders.push({ x: cell.x, y: cell.y, userId: String(row.attacker_id) });
  }
  return { anchors, claims, states: evaluatePastures(anchors, claims, intruders) };
}

async function grantStarter(sql: Sql, userId: string, x: number, y: number) {
  const have = await sql<Row>`select x from pastures where user_id = ${userId} limit 1`;
  if (have.length) return null;
  const camps = await sql<Row>`select x, y from tribes`;
  const taken = await sql<Row>`select x, y from pastures`;
  const blocked = new Set<string>();
  for (const camp of camps) blocked.add(cellKey(num(camp.x), num(camp.y)));
  for (const cell of taken) blocked.add(cellKey(num(cell.x), num(cell.y)));
  const spot = bestPastureNeighbor(x, y, (px, py) => blocked.has(cellKey(px, py)));
  if (!spot) return null;
  const inserted = await sql<Row>`
    insert into pastures (user_id, x, y)
    values (${userId}, ${spot.x}, ${spot.y})
    on conflict do nothing
    returning x
  `;
  return inserted.length ? spot : null;
}

async function ensurePastures(sql: Sql) {
  const tribes = await sql<Row>`
    select t.user_id, t.x, t.y
    from tribes t
    where not exists (select 1 from pastures p where p.user_id = t.user_id)
  `;
  for (const tribe of tribes) {
    await grantStarter(sql, String(tribe.user_id), num(tribe.x), num(tribe.y));
  }
}

async function finishClaims(sql: Sql) {
  const due = await sql<Row>`
    select user_id, claim_x, claim_y, claim_food, claim_gold
    from tribes
    where claim_until is not null and claim_until <= now()
  `;
  for (const row of due) {
    const id = String(row.user_id);
    const x = num(row.claim_x);
    const y = num(row.claim_y);
    const camps = await sql<Row>`select user_id from tribes where x = ${x} and y = ${y}`;
    let placed = false;
    if (!camps.length && inBounds(x, y)) {
      const inserted = await sql<Row>`
        insert into pastures (user_id, x, y)
        values (${id}, ${x}, ${y})
        on conflict do nothing
        returning x
      `;
      placed = inserted.length > 0;
    }
    if (!placed) {
      await creditCapped(sql, id, { water: 0, food: num(row.claim_food), gold: num(row.claim_gold), wood: 0, stone: 0 });
    }
    await sql`
      update tribes set
        claim_x = null,
        claim_y = null,
        claim_food = 0,
        claim_gold = 0,
        claim_until = null
      where user_id = ${id} and claim_until <= now()
    `;
  }
}

async function columnMap(sql: Sql, userId: string) {
  const rows = await sql<Row>`select kind, level from buildings where user_id = ${userId}`;
  const levels: Record<BuildingKind, number> = emptyLevels(0);
  for (const row of rows) {
    const kind = String(row.kind) as BuildingKind;
    if (kind in levels) levels[kind] = num(row.level);
  }
  return levels;
}

function flagsOf(kinds: Iterable<string>): StudyFlags {
  const flags = emptyStudyFlags();
  for (const kind of kinds) {
    if (kind === "cistern" || kind === "fodder" || kind === "scouts" || kind === "rampart") flags[kind] = true;
  }
  return flags;
}

async function studyFlags(sql: Sql, userId: string) {
  const rows = await sql<Row>`select kind from studies where user_id = ${userId} and done = true`;
  return flagsOf(rows.map((row) => String(row.kind)));
}

function asTrait(value: unknown): SheikhTrait {
  const trait = String(value ?? "");
  return isSheikhTrait(trait) ? trait : "guard";
}

function played(row: Row): SheikhTrait | null {
  return playedTrait(row.lineage, asTrait(row.sheikh_trait));
}

function said(text: string) {
  return text.startsWith("قال الراوي") ? text : `قال الراوي: ${text}`;
}

function swell(loot: Stock, trait: SheikhTrait, renown: number): Stock {
  if (trait !== "raid") return loot;
  const factor = traitFactor("raid", renown);
  return {
    water: Math.round(loot.water * factor),
    food: Math.round(loot.food * factor),
    gold: Math.round(loot.gold * factor),
    wood: Math.round(loot.wood * factor),
    stone: Math.round(loot.stone * factor),
  };
}

async function praise(sql: Sql, userId: string) {
  await sql`update tribes set renown = least(8, renown + 1) where user_id = ${userId}`;
}

async function finishStudies(sql: Sql) {
  await sql`
    update tribes set renown = least(8, renown + 1)
    where user_id in (
      select user_id from studies
      where done = false and finish_at is not null and finish_at <= now()
    )
  `;
  await sql`
    update studies
    set done = true, finish_at = null
    where done = false and finish_at is not null and finish_at <= now()
  `;
}

async function ensureBuildings(sql: Sql, userId: string) {
  for (const kind of BUILDING_KINDS) {
    const level = kind === "tent" ? 1 : 0;
    await sql`
      insert into buildings (user_id, kind, level)
      values (${userId}, ${kind}, ${level})
      on conflict (user_id, kind) do nothing
    `;
  }
}

async function spend(sql: Sql, userId: string, cost: Cost) {
  const rows = await sql<Row>`
    update tribes set
      water = water - ${cost.water},
      food = food - ${cost.food},
      gold = gold - ${cost.gold},
      wood = wood - ${cost.wood},
      stone = stone - ${cost.stone},
      people = people - ${cost.people}
    where user_id = ${userId}
      and water >= ${cost.water}
      and food >= ${cost.food}
      and gold >= ${cost.gold}
      and wood >= ${cost.wood}
      and stone >= ${cost.stone}
      and people >= ${cost.people}
    returning user_id
  `;
  return rows.length > 0;
}

async function refund(sql: Sql, userId: string, cost: Cost) {
  await creditCapped(sql, userId, cost);
  if (cost.people) await sql`update tribes set people = people + ${cost.people} where user_id = ${userId}`;
}

/** Add income under the caps. Whatever does not fit is lost and returned for the report. */
async function creditCapped(sql: Sql, userId: string, add: Stock) {
  const none: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
  const caps = capsOf(await columnMap(sql, userId));
  const put = (good: keyof Stock) => Math.max(0, Math.floor(add[good]));
  // One atomic statement: the cap is applied in SQL against the row as it is now,
  // and a stock already above its cap is never pushed down.
  const rows = await sql<Row>`
    with old as (
      select user_id, water, food, gold, wood, stone from tribes where user_id = ${userId} for update
    )
    update tribes t set
      water = greatest(t.water, least(${caps.water}, t.water + ${put("water")})),
      food = greatest(t.food, least(${caps.food}, t.food + ${put("food")})),
      gold = greatest(t.gold, least(${caps.gold}, t.gold + ${put("gold")})),
      wood = greatest(t.wood, least(${caps.wood}, t.wood + ${put("wood")})),
      stone = greatest(t.stone, least(${caps.stone}, t.stone + ${put("stone")}))
    from old
    where t.user_id = old.user_id
    returning old.water as w0, old.food as f0, old.gold as g0, old.wood as d0, old.stone as s0,
              t.water as w1, t.food as f1, t.gold as g1, t.wood as d1, t.stone as s1
  `;
  const row = rows[0];
  if (!row) return { gain: none, lost: none };
  const gain: Stock = {
    water: num(row.w1) - num(row.w0),
    food: num(row.f1) - num(row.f0),
    gold: num(row.g1) - num(row.g0),
    wood: num(row.d1) - num(row.d0),
    stone: num(row.s1) - num(row.s0),
  };
  const lost: Stock = {
    water: put("water") - gain.water,
    food: put("food") - gain.food,
    gold: put("gold") - gain.gold,
    wood: put("wood") - gain.wood,
    stone: put("stone") - gain.stone,
  };
  return { gain, lost };
}

/** Hand back a pending pasture claim's cost (capped) and clear the claim. */
async function returnClaim(sql: Sql, userId: string) {
  const rows = await sql<Row>`
    update tribes t set
      claim_x = null,
      claim_y = null,
      claim_food = 0,
      claim_gold = 0,
      claim_until = null
    from (select user_id, claim_food, claim_gold from tribes where user_id = ${userId}) old
    where t.user_id = old.user_id
    returning old.claim_food as food, old.claim_gold as gold
  `;
  const row = rows[0];
  if (!row) return;
  await creditCapped(sql, userId, { water: 0, food: num(row.food), gold: num(row.gold), wood: 0, stone: 0 });
}

async function noteClash(
  sql: Sql,
  x: number,
  y: number,
  attacker: string,
  defender: string,
  attackerWins: boolean,
  summary: string,
) {
  await sql`
    insert into clashes (x, y, attacker_name, defender_name, attacker_wins, summary)
    values (${x}, ${y}, ${attacker}, ${defender}, ${attackerWins}, ${summary})
  `;
  await sql`delete from clashes where created_at < now() - interval '3 minutes'`;
}

async function writeReport(
  sql: Sql,
  userId: string,
  kind: string,
  title: string,
  body: string,
  victory: boolean | null,
) {
  await sql`
    insert into reports (user_id, kind, title, body, victory)
    values (${userId}, ${kind}, ${title}, ${body}, ${victory})
  `;
  await sql`
    delete from reports
    where user_id = ${userId}
      and id not in (
        select id from reports where user_id = ${userId} order by id desc limit 40
      )
  `;
}

function troopPhrase(infantry: number, cavalry: number) {
  const parts: string[] = [];
  if (infantry > 0) parts.push(`${infantry} مشاة`);
  if (cavalry > 0) parts.push(`${cavalry} فرسان`);
  return parts.join(" و") || "لا أحد";
}

function clashLine(attacker: string, atkInf: number, atkCav: number, defender: string, defInf: number, defCav: number, loot: string) {
  const haul = loot ? `غنائم: ${loot}` : "لا غنائم";
  return `${attacker} خسرت ${troopPhrase(atkInf, atkCav)}. ${defender} خسرت ${troopPhrase(defInf, defCav)}. ${haul}.`;
}

function lootPhrase(loot: Stock) {
  const bits: string[] = [];
  if (loot.food) bits.push(`${loot.food} طعام`);
  if (loot.gold) bits.push(`${loot.gold} ذهب`);
  if (loot.wood) bits.push(`${loot.wood} خشب`);
  if (loot.stone) bits.push(`${loot.stone} حجر`);
  if (loot.water) bits.push(`${loot.water} ماء`);
  return bits.join("، ");
}

function lineNear(x0: number, y0: number, x1: number, y1: number, bx: number, by: number, rad: number) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  if (steps === 0) return false;
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    if (chebyshev(x, y, bx, by) <= rad) return true;
  }
  return false;
}

async function finishBuilds(sql: Sql) {
  await sql`
    update buildings
    set level = level + 1, upgrade_until = null
    where upgrade_until is not null and upgrade_until <= now()
  `;
}

async function finishFields(sql: Sql) {
  await sql`
    update fields
    set level = least(${FIELD_MAX}, level + 1), upgrade_until = null
    where upgrade_until is not null and upgrade_until <= now()
  `;
}

async function ensureFields(sql: Sql) {
  for (const slot of FIELD_SLOTS) {
    await sql`
      insert into fields (user_id, slot, good, level)
      select user_id, ${slot.slot}, ${slot.good}, ${slot.start}
      from tribes
      on conflict (user_id, slot) do nothing
    `;
  }
}

async function villageBusy(sql: Sql, userId: string) {
  const buildings = await sql<Row>`
    select kind from buildings where user_id = ${userId} and upgrade_until is not null limit 1
  `;
  if (buildings.length) return true;
  const fields = await sql<Row>`
    select slot from fields where user_id = ${userId} and upgrade_until is not null limit 1
  `;
  return fields.length > 0;
}

async function finishExpand(sql: Sql) {
  await sql`
    update tribes
    set sanctuary = sanctuary + 1, expand_until = null
    where expand_until is not null and expand_until <= now() and sanctuary < ${MAX_SANCTUARY}
  `;
  await sql`
    update tribes
    set expand_until = null
    where expand_until is not null and expand_until <= now() and sanctuary >= ${MAX_SANCTUARY}
  `;
}

async function accrue(sql: Sql) {
  const tribes = await sql<Row>`select user_id, sanctuary, sheikh_trait, lineage, renown from tribes`;
  const buildings = await sql<Row>`select user_id, kind, level from buildings`;
  const fieldRows = await sql<Row>`select user_id, good, level from fields`;
  const done = await sql<Row>`select user_id, kind from studies where done = true`;
  const byUser = new Map<string, Record<BuildingKind, number>>();
  const fieldsBy = new Map<string, { good: FieldGood; level: number }[]>();
  const flagsBy = new Map<string, string[]>();
  for (const row of buildings) {
    const id = String(row.user_id);
    const bag = byUser.get(id) ?? emptyLevels(0);
    const kind = String(row.kind) as BuildingKind;
    if (kind in bag) bag[kind] = num(row.level);
    byUser.set(id, bag);
  }
  for (const row of fieldRows) {
    const id = String(row.user_id);
    const good = String(row.good);
    if (good !== "water" && good !== "food" && good !== "wood" && good !== "stone") continue;
    const list = fieldsBy.get(id) ?? [];
    list.push({ good, level: num(row.level) });
    fieldsBy.set(id, list);
  }
  for (const row of done) {
    const id = String(row.user_id);
    const list = flagsBy.get(id) ?? [];
    list.push(String(row.kind));
    flagsBy.set(id, list);
  }
  const pasture = await readPastures(sql, Date.now());
  for (const tribe of tribes) {
    const id = String(tribe.user_id);
    const levels = byUser.get(id) ?? emptyLevels(1);
    const sanctuary = Math.max(1, num(tribe.sanctuary));
    let bonusRates = applyStudies(ratesPerMin(levels, sanctuary, fieldsBy.get(id) ?? []), flagsOf(flagsBy.get(id) ?? []));
    if (played(tribe) === "water") {
      bonusRates = { ...bonusRates, water: Math.round(bonusRates.water * traitFactor("water", num(tribe.renown))) };
    }
    const extra = pastureYield(pasture.states, id, tribe.lineage);
    bonusRates = {
      ...bonusRates,
      water: bonusRates.water + extra.water,
      food: bonusRates.food + extra.food,
      wood: bonusRates.wood + extra.wood,
      stone: bonusRates.stone + extra.stone,
    };
    const cap = storageCap(levels.storehouse);
    const gcap = capsOf(levels).gold;
    const pcap = peopleCap(levels.tent || 1);
    const grow = peopleGrowMs(levels.tent || 1);
    await sql`
      with d as (
        select greatest(
          0,
          least(extract(epoch from (now() - last_tick))::int, ${MAX_ACCRUE_SEC})
        ) as sec
        from tribes
        where user_id = ${id}
      )
      update tribes t set
        water = case when t.water >= ${cap} then t.water else least(${cap}, t.water + (${bonusRates.water} * d.sec) / 60) end,
        food = case when t.food >= ${cap} then t.food else least(${cap}, t.food + (${bonusRates.food} * d.sec) / 60) end,
        gold = case when t.gold >= ${gcap} then t.gold else least(${gcap}, t.gold + (${bonusRates.gold} * d.sec) / 60) end,
        wood = case when t.wood >= ${cap} then t.wood else least(${cap}, t.wood + (${bonusRates.wood} * d.sec) / 60) end,
        stone = case when t.stone >= ${cap} then t.stone else least(${cap}, t.stone + (${bonusRates.stone} * d.sec) / 60) end,
        people = case
          when t.food > ${PEOPLE_FOOD_GATE} and t.people < ${pcap}
            then least(${pcap}, t.people + ((t.people_bank + d.sec * 1000) / ${grow})::int)
          else t.people
        end,
        people_bank = case
          when t.food > ${PEOPLE_FOOD_GATE} and t.people < ${pcap}
            then (t.people_bank + d.sec * 1000) % ${grow}
          else t.people_bank
        end,
        last_tick = now()
      from d
      where t.user_id = ${id} and d.sec >= 1
    `;
  }
}

async function finishTraining(sql: Sql) {
  const due = await sql<Row>`select id from trainings where finish_at <= now()`;
  for (const row of due) {
    const claimed = await sql<Row>`
      delete from trainings
      where id = ${num(row.id)} and finish_at <= now()
      returning user_id, kind, qty
    `;
    const job = claimed[0];
    if (!job) continue;
    const qty = num(job.qty);
    if (job.kind === "cavalry") {
      await sql`update tribes set cavalry = cavalry + ${qty} where user_id = ${String(job.user_id)}`;
    } else {
      await sql`update tribes set infantry = infantry + ${qty} where user_id = ${String(job.user_id)}`;
    }
  }
}

async function finishMoves(sql: Sql) {
  const due = await sql<Row>`
    select user_id, move_x, move_y, move_cost
    from tribes
    where move_until is not null and move_until <= now()
  `;
  if (!due.length) return;
  const occupied = await sql<Row>`select user_id, x, y from tribes`;
  const bandits = await sql<Row>`select x, y from bandits`;
  const pastureRows = await sql<Row>`select x, y from pastures`;
  const taken = new Set<string>();
  for (const row of occupied) taken.add(key(num(row.x), num(row.y)));
  for (const row of bandits) taken.add(key(num(row.x), num(row.y)));
  for (const row of pastureRows) taken.add(key(num(row.x), num(row.y)));

  for (const row of due) {
    const id = String(row.user_id);
    const x = num(row.move_x);
    const y = num(row.move_y);
    const spot = key(x, y);
    const own = occupied.find((c) => String(c.user_id) === id);
    const ownKey = own ? key(num(own.x), num(own.y)) : "";
    if (!inBounds(x, y) || (taken.has(spot) && spot !== ownKey)) {
      const refundGold = num(row.move_cost);
      await creditCapped(sql, id, { water: 0, food: 0, gold: refundGold, wood: 0, stone: 0 });
      await sql`
        update tribes set
          move_x = null,
          move_y = null,
          move_until = null,
          move_cost = 0
        where user_id = ${id} and move_until is not null and move_until <= now()
      `;
      await writeReport(
        sql,
        id,
        "move",
        "تعذّر النقل",
        `الموضع الذي قصدته صار مشغولاً. رُدّ إليك ${refundGold} ذهب.`,
        false,
      );
      continue;
    }
    const moved = await sql`
      update tribes set
        x = ${x},
        y = ${y},
        move_x = null,
        move_y = null,
        move_until = null,
        move_cost = 0,
        moves_done = moves_done + 1
      where user_id = ${id} and move_until is not null and move_until <= now()
      returning user_id
    `;
    if (moved.length) {
      taken.add(spot);
      await returnClaim(sql, id);
      await sql`delete from pastures where user_id = ${id}`;
      await grantStarter(sql, id, x, y);
    }
  }
}

async function loadBandits(sql: Sql) {
  return sql<Row>`select id, x, y, tier, infantry, cavalry, gold, food, water, wood, stone from bandits`;
}

async function sendHome(
  sql: Sql,
  march: Row,
  infantry: number,
  cavalry: number,
  fromX: number,
  fromY: number,
) {
  const id = num(march.id);
  if (infantry + cavalry <= 0) {
    await sql`update marches set status = 'done', infantry = 0, cavalry = 0 where id = ${id}`;
    return;
  }
  const attacker = await sql<Row>`select x, y, sheikh_trait, lineage, renown from tribes where user_id = ${String(march.attacker_id)}`;
  const home = attacker[0];
  if (!home) {
    await sql`update marches set status = 'done' where id = ${id}`;
    return;
  }
  const hx = num(home.x);
  const hy = num(home.y);
  const sec = paceOf(
    distance(fromX, fromY, hx, hy),
    (await studyFlags(sql, String(march.attacker_id))).scouts,
    played(home) ?? "guard",
    num(home.renown),
  );
  await sql`
    update marches set
      status = 'return',
      infantry = ${infantry},
      cavalry = ${cavalry},
      from_x = ${fromX},
      from_y = ${fromY},
      to_x = ${hx},
      to_y = ${hy},
      depart_at = now(),
      arrive_at = now() + make_interval(secs => ${sec})
    where id = ${id} and status = 'resolving'
  `;
}

async function resolveMarches(sql: Sql) {
  const returning = await sql<Row>`select id, attacker_id, infantry, cavalry from marches where status = 'return' and arrive_at <= now()`;
  for (const row of returning) {
    const claimed = await sql<Row>`
      update marches set status = 'done'
      where id = ${num(row.id)} and status = 'return' and arrive_at <= now()
      returning infantry, cavalry, attacker_id
    `;
    const back = claimed[0];
    if (!back) continue;
    await sql`
      update tribes set
        infantry = infantry + ${num(back.infantry)},
        cavalry = cavalry + ${num(back.cavalry)}
      where user_id = ${String(back.attacker_id)}
    `;
  }
  await sql`delete from marches where status = 'done'`;

  const due = await sql<Row>`select id from marches where status = 'march' and arrive_at <= now()`;
  for (const row of due) {
    const claimed = await sql<Row>`
      update marches set status = 'resolving'
      where id = ${num(row.id)} and status = 'march' and arrive_at <= now()
      returning *
    `;
    const march = claimed[0];
    if (!march) continue;
    try {
      await resolveOne(sql, march);
    } catch (error) {
      console.error("[march] resolve failed", error);
      await sendHome(sql, march, num(march.infantry), num(march.cavalry), num(march.to_x), num(march.to_y));
    }
  }
  await sql`delete from marches where status = 'done'`;
}

async function sitOnPasture(sql: Sql, march: Row, infantry: number, cavalry: number) {
  await sql`
    update marches set
      status = 'occupy',
      infantry = ${infantry},
      cavalry = ${cavalry},
      from_x = to_x,
      from_y = to_y,
      depart_at = now(),
      arrive_at = now() + make_interval(secs => ${SPOIL_HOLD_SEC})
    where id = ${num(march.id)} and status = 'resolving'
  `;
}

async function releaseOccupiers(sql: Sql) {
  const due = await sql<Row>`select * from marches where status = 'occupy' and arrive_at <= now()`;
  for (const row of due) {
    const claimed = await sql<Row>`
      update marches set status = 'resolving'
      where id = ${num(row.id)} and status = 'occupy' and arrive_at <= now()
      returning *
    `;
    const march = claimed[0];
    if (!march) continue;
    await sendHome(sql, march, num(march.infantry), num(march.cavalry), num(march.to_x), num(march.to_y));
  }
}

async function finishSpoil(sql: Sql, march: Row, attackerId: string, attackerName: string, infantry: number, cavalry: number) {
  const toX = num(march.to_x);
  const toY = num(march.to_y);
  const occupiers = await sql<Row>`
    select * from marches
    where status = 'occupy' and to_x = ${toX} and to_y = ${toY} and attacker_id <> ${attackerId}
    limit 1
  `;
  const occupier = occupiers[0];
  if (occupier) {
    const occId = String(occupier.attacker_id);
    const occNameRow = await sql<Row>`select name from tribes where user_id = ${occId}`;
    const occName = occNameRow[0] ? String(occNameRow[0].name) : "دخيل";
    const battle = resolveBattle(
      { infantry, cavalry },
      { infantry: num(occupier.infantry), cavalry: num(occupier.cavalry) },
      0,
    );
    const leftInf = Math.max(0, infantry - battle.atkInfLoss);
    const leftCav = Math.max(0, cavalry - battle.atkCavLoss);
    const occInf = Math.max(0, num(occupier.infantry) - battle.defInfLoss);
    const occCav = Math.max(0, num(occupier.cavalry) - battle.defCavLoss);
    await sql`
      update marches set status = 'resolving', infantry = ${occInf}, cavalry = ${occCav}
      where id = ${num(occupier.id)} and status = 'occupy'
    `;
    await sendHome(sql, occupier, occInf, occCav, toX, toY);
    await noteClash(
      sql,
      toX,
      toY,
      attackerName,
      occName,
      battle.attackerWins,
      battle.attackerWins ? "طُهّر المرعى" : "ثبت الدخيل على المرعى",
    );
    await writeReport(
      sql,
      attackerId,
      "spoil",
      battle.attackerWins ? "طُهّر المرعى" : "فشل التطهير",
      `قتال على المرعى بلا غنيمة مخزن. خسائرك ${troopPhrase(battle.atkInfLoss, battle.atkCavLoss)}.`,
      battle.attackerWins,
    );
    await writeReport(
      sql,
      occId,
      "spoil",
      battle.attackerWins ? "أُخرجت من المرعى" : "ثبتّ على المرعى",
      `${attackerName} لاقاك على المربع. خسائرك ${troopPhrase(battle.defInfLoss, battle.defCavLoss)}. مواردك لم تُمس.`,
      !battle.attackerWins,
    );
    if (battle.attackerWins && leftInf + leftCav > 0) await sitOnPasture(sql, march, leftInf, leftCav);
    else await sendHome(sql, march, leftInf, leftCav, toX, toY);
    return;
  }

  const bandit = (await loadBandits(sql)).find((row) => num(row.x) === toX && num(row.y) === toY);
  if (bandit) {
    const battle = resolveBattle(
      { infantry, cavalry },
      { infantry: num(bandit.infantry), cavalry: num(bandit.cavalry) },
      0,
    );
    const leftInf = Math.max(0, infantry - battle.atkInfLoss);
    const leftCav = Math.max(0, cavalry - battle.atkCavLoss);
    const dInf = Math.max(0, num(bandit.infantry) - battle.defInfLoss);
    const dCav = Math.max(0, num(bandit.cavalry) - battle.defCavLoss);
    if (battle.attackerWins || dInf + dCav <= 0) await sql`delete from bandits where id = ${num(bandit.id)}`;
    else await sql`update bandits set infantry = ${dInf}, cavalry = ${dCav} where id = ${num(bandit.id)}`;
    await writeReport(
      sql,
      attackerId,
      "spoil",
      battle.attackerWins ? "رُفع القطاع عن المرعى" : "صدّ القطاع التطهير",
      `المعسكر على مرعاك. خسائرك ${troopPhrase(battle.atkInfLoss, battle.atkCavLoss)}. مخزن الديرة لم يُفتح.`,
      battle.attackerWins,
    );
    await sendHome(sql, march, leftInf, leftCav, toX, toY);
    return;
  }

  const owners = await sql<Row>`select user_id from pastures where x = ${toX} and y = ${toY}`;
  const foreign = owners.map((row) => String(row.user_id)).filter((id) => id !== attackerId);
  if (!foreign.length) {
    await writeReport(sql, attackerId, "spoil", "المرعى خالٍ", "وصلت القوة ولم تجد دخيلاً. عادت من غير غنيمة.", null);
    await sendHome(sql, march, infantry, cavalry, toX, toY);
    return;
  }
  let sacred = false;
  for (const ownerId of foreign) {
    const rows = await sql<Row>`select name, peace_until, lineage from tribes where user_id = ${ownerId}`;
    const peace = epoch(rows[0]?.peace_until);
    if (peace != null && peace > Date.now()) {
      await writeReport(sql, attackerId, "peace", "الدرع يردّ الإسكات", said("درع المبتدئ ما زال يحمي هذا المرعى. عادت القوة."), false);
      await writeReport(sql, ownerId, "peace", "ارتدّ دخيل عن المرعى", said(`${attackerName} اقترب من مرعاك ثم ارتدّ. الدرع قائم.`), true);
      await sendHome(sql, march, infantry, cavalry, toX, toY);
      return;
    }
    if (lineageBy(rows[0]?.lineage)?.edge === "sacred") sacred = true;
  }
  await sitOnPasture(sql, march, infantry, cavalry);
  if (sacred) await sql`update tribes set renown = greatest(0, renown - 1) where user_id = ${attackerId}`;
  const base = pastureBase(toX, toY);
  const what = base.good ? `يسكت ${base.rate} في الدقيقة` : "درب بلا إنتاج";
  await writeReport(
    sql,
    attackerId,
    "spoil",
    "وقفت على المرعى",
    said(`قوتك واقفة على المربع ${SPOIL_HOLD_SEC} ثانية. ${what}. مواردهم لم تُنهب.${sacred ? " هذا حمى خزاعة، فنقص صيتك." : ""}`),
    true,
  );
  for (const ownerId of foreign) {
    await writeReport(
      sql,
      ownerId,
      "spoil",
      "دخيل على المرعى",
      said(`${attackerName} يقف على مربع من سلسلتك. إنتاجه صامت حتى يُطهَّر أو يرحل.${sacred ? " الصيت الذي دنّس الحمى نقص." : ""}`),
      false,
    );
  }
}

async function resolveOne(sql: Sql, march: Row) {
  let infantry = num(march.infantry);
  let cavalry = num(march.cavalry);
  const toX = num(march.to_x);
  const toY = num(march.to_y);
  const fromX = num(march.from_x);
  const fromY = num(march.from_y);
  const attackerId = String(march.attacker_id);
  const attackerRows = await sql<Row>`select name from tribes where user_id = ${attackerId}`;
  const attackerName = attackerRows[0] ? String(attackerRows[0].name) : "قبيلة";
  const publicName = flag(march.masked) ? "غارة ليل" : attackerName;
  const chiefRows = await sql<Row>`select sheikh_trait, lineage, renown from tribes where user_id = ${attackerId}`;
  const atkTrait = played(chiefRows[0] ?? {}) ?? "guard";
  const atkRenown = num(chiefRows[0]?.renown);
  if (String(march.purpose ?? "attack") === "scout") {
    await finishScout(sql, march, attackerId, attackerName);
    return;
  }
  if (String(march.purpose ?? "attack") === "spoil") {
    await finishSpoil(sql, march, attackerId, publicName, infantry, cavalry);
    return;
  }

  const bandits = await loadBandits(sql);
  const targetBanditId = march.target_kind === "bandit" ? num(march.target_id) : -1;
  const ambusher = bandits.find((b) => {
    if (num(b.id) === targetBanditId) return false;
    return lineNear(fromX, fromY, toX, toY, num(b.x), num(b.y), AMBUSH_RANGE);
  });

  if (ambusher && infantry + cavalry > 0) {
    const battle = resolveBattle(
      { infantry, cavalry },
      { infantry: num(ambusher.infantry), cavalry: num(ambusher.cavalry) },
      0,
    );
    const aInf = infantry - battle.atkInfLoss;
    const aCav = cavalry - battle.atkCavLoss;
    const dInf = num(ambusher.infantry) - battle.defInfLoss;
    const dCav = num(ambusher.cavalry) - battle.defCavLoss;
    if (dInf + dCav <= 0) {
      await sql`delete from bandits where id = ${num(ambusher.id)}`;
    } else {
      await sql`update bandits set infantry = ${dInf}, cavalry = ${dCav} where id = ${num(ambusher.id)}`;
    }
    const label = banditLabel(num(ambusher.tier));
    await writeReport(
      sql,
      attackerId,
      "ambush",
      battle.attackerWins ? `صددت كميناً` : `كمين ${label}`,
      `${label} صادفت المسير. قوّتك ${troopPhrase(infantry, cavalry)}. خسائرك ${troopPhrase(battle.atkInfLoss, battle.atkCavLoss)}. ${
        battle.attackerWins ? "انفك الطريق." : "تفرّقت القوّة تحت الكمين."
      }`,
      battle.attackerWins,
    );
    await noteClash(
      sql,
      num(ambusher.x),
      num(ambusher.y),
      publicName,
      label,
      battle.attackerWins,
      clashLine(publicName, battle.atkInfLoss, battle.atkCavLoss, label, battle.defInfLoss, battle.defCavLoss, ""),
    );
    infantry = Math.max(0, aInf);
    cavalry = Math.max(0, aCav);
    if (infantry + cavalry <= 0) {
      await sql`update marches set status = 'done', infantry = 0, cavalry = 0 where id = ${num(march.id)}`;
      return;
    }
  }

  if (march.target_kind === "bandit") {
    const bandit = (await loadBandits(sql)).find((b) => num(b.id) === targetBanditId);
    if (!bandit) {
      await writeReport(sql, attackerId, "attack", "المعسكر خلا", "وصلت الطليعة ولم تجد أحداً. القوّة عائدة.", null);
      await sendHome(sql, march, infantry, cavalry, toX, toY);
      return;
    }
    const battle = resolveBattle(
      { infantry, cavalry },
      { infantry: num(bandit.infantry), cavalry: num(bandit.cavalry) },
      0,
    );
    const leftInf = Math.max(0, infantry - battle.atkInfLoss);
    const leftCav = Math.max(0, cavalry - battle.atkCavLoss);
    const dInf = Math.max(0, num(bandit.infantry) - battle.defInfLoss);
    const dCav = Math.max(0, num(bandit.cavalry) - battle.defCavLoss);
    const label = banditLabel(num(bandit.tier));
    let loot: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
    let spill = "";
    if (battle.attackerWins) {
      loot = takeLoot(
        {
          water: num(bandit.water),
          food: num(bandit.food),
          gold: num(bandit.gold),
          wood: num(bandit.wood),
          stone: num(bandit.stone),
        },
        carryOf(infantry, cavalry),
      );
      loot = swell(loot, atkTrait, atkRenown);
      await praise(sql, attackerId);
      await sql`delete from bandits where id = ${num(bandit.id)}`;
      const credited = await creditCapped(sql, attackerId, loot);
      loot = credited.gain;
      spill = spillNote(credited.lost);
    } else if (dInf + dCav <= 0) {
      await sql`delete from bandits where id = ${num(bandit.id)}`;
    } else {
      await sql`update bandits set infantry = ${dInf}, cavalry = ${dCav} where id = ${num(bandit.id)}`;
    }
    const lootText = lootPhrase(loot);
    await writeReport(
      sql,
      attackerId,
      "attack",
      battle.attackerWins ? `نصر على ${label}` : `هزيمة أمام ${label}`,
      `المواجهة مع ${label}. قوّتك ${troopPhrase(infantry, cavalry)}، وخسائرك ${troopPhrase(battle.atkInfLoss, battle.atkCavLoss)}. ${
        lootText ? `الغنائم: ${lootText}.` : "لا غنائم."
      }${spill ? ` ${spill}` : ""} ${leftInf + leftCav > 0 ? "الناجون في طريق العودة." : "لم يعد أحد."}`,
      battle.attackerWins,
    );
    await noteClash(
      sql,
      num(bandit.x),
      num(bandit.y),
      publicName,
      label,
      battle.attackerWins,
      clashLine(publicName, battle.atkInfLoss, battle.atkCavLoss, label, battle.defInfLoss, battle.defCavLoss, lootText),
    );
    await sendHome(sql, march, leftInf, leftCav, num(bandit.x), num(bandit.y));
    return;
  }

  if (march.target_kind === "saalik") {
    const rows = await sql<Row>`select id, name, x, y, cavalry, gold, food from saalik where id = ${num(march.target_id)}`;
    const man = rows[0];
    if (!man) {
      await writeReport(sql, attackerId, "attack", "الصعلوك رحل", "وصلت الطليعة ولم تجد أحداً. القوّة عائدة.", null);
      await sendHome(sql, march, infantry, cavalry, toX, toY);
      return;
    }
    const battle = resolveBattle({ infantry, cavalry }, { infantry: 0, cavalry: num(man.cavalry) }, 0);
    const leftInf = Math.max(0, infantry - battle.atkInfLoss);
    const leftCav = Math.max(0, cavalry - battle.atkCavLoss);
    const dCav = Math.max(0, num(man.cavalry) - battle.defCavLoss);
    let loot: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
    let spill = "";
    if (battle.attackerWins) {
      loot = swell(
        takeLoot({ water: 0, food: num(man.food), gold: num(man.gold), wood: 0, stone: 0 }, carryOf(infantry, cavalry)),
        atkTrait,
        atkRenown,
      );
      await sql`delete from saalik where id = ${num(man.id)}`;
      const credited = await creditCapped(sql, attackerId, loot);
      loot = credited.gain;
      spill = spillNote(credited.lost);
      await praise(sql, attackerId);
    } else if (dCav <= 0) {
      await sql`delete from saalik where id = ${num(man.id)}`;
    } else {
      await sql`update saalik set cavalry = ${dCav} where id = ${num(man.id)}`;
    }
    const lootText = lootPhrase(loot);
    const label = String(man.name);
    await writeReport(
      sql,
      attackerId,
      "attack",
      battle.attackerWins ? `نصر على ${label}` : `هزيمة أمام ${label}`,
      `المواجهة مع الصعلوك ${label}. خسائرك ${troopPhrase(battle.atkInfLoss, battle.atkCavLoss)}. ${lootText ? `الغنائم: ${lootText}.` : "لا غنائم."}${spill ? ` ${spill}` : ""}`,
      battle.attackerWins,
    );
    await noteClash(
      sql,
      num(man.x),
      num(man.y),
      publicName,
      label,
      battle.attackerWins,
      clashLine(publicName, battle.atkInfLoss, battle.atkCavLoss, label, 0, battle.defCavLoss, lootText),
    );
    await sendHome(sql, march, leftInf, leftCav, num(man.x), num(man.y));
    return;
  }

  const defenderId = String(march.target_id);
  const defenders = await sql<Row>`
    select user_id, name, x, y, infantry, cavalry, water, food, gold, wood, stone, peace_until, sheikh_trait, lineage, renown
    from tribes where user_id = ${defenderId}
  `;
  const defender = defenders[0];
  if (!defender) {
    await writeReport(sql, attackerId, "attack", "القبيلة رحلت", "لم يعد للهدف مضارب في الوادي. القوّة عائدة.", null);
    await sendHome(sql, march, infantry, cavalry, toX, toY);
    return;
  }
  const peace = epoch(defender.peace_until);
  if (peace != null && peace > Date.now()) {
    await writeReport(
      sql,
      attackerId,
      "peace",
      "صدّ الحمى الهجوم",
      `درع المبتدئ ما زال يحمي ${String(defender.name)}. عادت القوّة من غير قتال.`,
      false,
    );
    await writeReport(
      sql,
      defenderId,
      "peace",
      "ارتدّ طارق عن الحمى",
      `اقتربت قوّة من ${publicName} ثم ارتدّت. الدرع ما زال قائماً.`,
      true,
    );
    await noteClash(sql, num(defender.x), num(defender.y), publicName, String(defender.name), false, "ارتدّت عن الدرع");
    await sendHome(sql, march, infantry, cavalry, num(defender.x), num(defender.y));
    return;
  }

  const defLevels = await columnMap(sql, defenderId);
  const defenderFlags = await studyFlags(sql, defenderId);
  const wall = defenseOf(defLevels.tent, defenderFlags.rampart);
  const guarded = played(defender) === "guard" ? Math.round(wall * traitFactor("guard", num(defender.renown))) : wall;
  const battle = resolveBattle(
    { infantry, cavalry },
    { infantry: num(defender.infantry), cavalry: num(defender.cavalry) },
    guarded,
  );
  const leftInf = Math.max(0, infantry - battle.atkInfLoss);
  const leftCav = Math.max(0, cavalry - battle.atkCavLoss);
  const defInfLeft = Math.max(0, num(defender.infantry) - battle.defInfLoss);
  const defCavLeft = Math.max(0, num(defender.cavalry) - battle.defCavLoss);
  let loot: Stock = { water: 0, food: 0, gold: 0, wood: 0, stone: 0 };
  const onDirah = num(defender.x) === toX && num(defender.y) === toY;
  if (battle.attackerWins && onDirah) {
    loot = takeLoot(
      {
        water: num(defender.water),
        food: num(defender.food),
        gold: num(defender.gold),
        wood: num(defender.wood),
        stone: num(defender.stone),
      },
      carryOf(infantry, cavalry),
    );
    loot = swell(loot, atkTrait, atkRenown);
    await praise(sql, attackerId);
  }
  await sql`
    update tribes set
      infantry = ${defInfLeft},
      cavalry = ${defCavLeft},
      water = greatest(0, water - ${loot.water}),
      food = greatest(0, food - ${loot.food}),
      gold = greatest(0, gold - ${loot.gold}),
      wood = greatest(0, wood - ${loot.wood}),
      stone = greatest(0, stone - ${loot.stone})
    where user_id = ${defenderId}
  `;
  let kept = loot;
  let spill = "";
  if (battle.attackerWins && onDirah) {
    const credited = await creditCapped(sql, attackerId, loot);
    kept = credited.gain;
    spill = spillNote(credited.lost);
  }
  const lootText = lootPhrase(loot);
  const keptText = lootPhrase(kept);
  const defName = String(defender.name);
  await writeReport(
    sql,
    attackerId,
    "attack",
    battle.attackerWins ? `نصر على ${defName}` : `هزيمة أمام ${defName}`,
    `قال الراوي: هجوم على ${defName}. أرسلت ${troopPhrase(infantry, cavalry)}. خسائرك ${troopPhrase(battle.atkInfLoss, battle.atkCavLoss)}. خسائرهم ${troopPhrase(battle.defInfLoss, battle.defCavLoss)}. ${
      keptText ? `الغنائم: ${keptText}.` : "لم تُحمَل غنائم."
    }${spill ? ` ${spill}` : ""} ${leftInf + leftCav > 0 ? "الناجون يعودون." : "لم يعد أحد."}`,
    battle.attackerWins,
  );
  await writeReport(
    sql,
    defenderId,
    "defense",
    battle.attackerWins ? `${publicName} اقتحمت مضاربك` : `صددت ${publicName}`,
    `${publicName} هجمت على المضارب. خسائرك ${troopPhrase(battle.defInfLoss, battle.defCavLoss)}. خسائرهم ${troopPhrase(battle.atkInfLoss, battle.atkCavLoss)}. ${
      lootText ? `ما حُمل: ${lootText}.` : "لم يُحمل شيء."
    }`,
    !battle.attackerWins,
  );
  await noteClash(
    sql,
    num(defender.x),
    num(defender.y),
    publicName,
    defName,
    battle.attackerWins,
    clashLine(publicName, battle.atkInfLoss, battle.atkCavLoss, defName, battle.defInfLoss, battle.defCavLoss, lootText),
  );
  if (!battle.attackerWins) await praise(sql, defenderId);
  await sendHome(sql, march, leftInf, leftCav, num(defender.x), num(defender.y));
}

async function raids(sql: Sql) {
  const tribes = await sql<Row>`
    select user_id, name, x, y, infantry, cavalry, water, food, gold, wood, stone, peace_until, last_raid_at
    from tribes
  `;
  const bandits = await loadBandits(sql);
  const buildings = await sql<Row>`select user_id, kind, level from buildings where kind = 'tent'`;
  const tents = new Map<string, number>();
  for (const row of buildings) tents.set(String(row.user_id), num(row.level));
  const ramparts = new Set(
    (await sql<Row>`select user_id from studies where kind = 'rampart' and done = true`).map((row) => String(row.user_id)),
  );

  for (const tribe of tribes) {
    const peace = epoch(tribe.peace_until);
    if (peace != null && peace > Date.now()) continue;
    const near = bandits
      .filter((b) => chebyshev(num(b.x), num(b.y), num(tribe.x), num(tribe.y)) <= RAID_RANGE)
      .sort((a, b) => armyPower(num(b.infantry), num(b.cavalry)) - armyPower(num(a.infantry), num(a.cavalry)));
    const bandit = near[0];
    if (!bandit) continue;
    const tent = tents.get(String(tribe.user_id)) ?? 1;
    const mine = armyPower(num(tribe.infantry), num(tribe.cavalry)) + defenseOf(tent, ramparts.has(String(tribe.user_id)));
    const theirs = armyPower(num(bandit.infantry), num(bandit.cavalry));
    if (mine >= theirs * 0.85) continue;
    const lossInf = num(tribe.infantry) > 0 ? Math.max(1, Math.round(num(tribe.infantry) * 0.35)) : 0;
    const lossCav = num(tribe.cavalry) > 0 ? Math.max(0, Math.round(num(tribe.cavalry) * 0.35)) : 0;
    const stock: Stock = {
      water: num(tribe.water),
      food: num(tribe.food),
      gold: num(tribe.gold),
      wood: num(tribe.wood),
      stone: num(tribe.stone),
    };
    const loot: Stock = {
      water: Math.floor(stock.water * 0.1),
      food: Math.floor(stock.food * 0.12),
      gold: Math.floor(stock.gold * 0.1),
      wood: Math.floor(stock.wood * 0.1),
      stone: Math.floor(stock.stone * 0.08),
    };
    const hit = await sql<Row>`
      update tribes set
        last_raid_at = now(),
        infantry = greatest(0, infantry - ${lossInf}),
        cavalry = greatest(0, cavalry - ${lossCav}),
        water = greatest(0, water - ${loot.water}),
        food = greatest(0, food - ${loot.food}),
        gold = greatest(0, gold - ${loot.gold}),
        wood = greatest(0, wood - ${loot.wood}),
        stone = greatest(0, stone - ${loot.stone})
      where user_id = ${String(tribe.user_id)}
        and (peace_until is null or peace_until <= now())
        and (last_raid_at is null or last_raid_at <= now() - make_interval(secs => ${RAID_COOLDOWN_SEC}))
      returning user_id
    `;
    if (!hit.length) continue;
    const bInf = Math.max(0, num(bandit.infantry) - Math.max(1, Math.round(num(bandit.infantry) * 0.2)));
    const bCav = Math.max(0, num(bandit.cavalry) - Math.round(num(bandit.cavalry) * 0.2));
    if (bInf + bCav <= 0) await sql`delete from bandits where id = ${num(bandit.id)}`;
    else await sql`update bandits set infantry = ${bInf}, cavalry = ${bCav} where id = ${num(bandit.id)}`;
    const label = banditLabel(num(bandit.tier));
    const taken = lootPhrase(loot);
    await writeReport(
      sql,
      String(tribe.user_id),
      "raid",
      `غارة ${label}`,
      `${label} أغاروا على أطراف المضارب. خسرت ${troopPhrase(lossInf, lossCav)}. ${taken ? `حملوا معهم ${taken}.` : "لم يجدوا ما يُحمل."} قوّة في الثكنة تصدّ الغارة التالية.`,
      false,
    );
    await noteClash(
      sql,
      num(tribe.x),
      num(tribe.y),
      label,
      String(tribe.name),
      false,
      clashLine(label, 0, 0, String(tribe.name), lossInf, lossCav, taken),
    );
  }
}

function ring(x: number, y: number, dist: number) {
  const spots: { x: number; y: number }[] = [];
  for (let dy = -dist; dy <= dist; dy++) {
    for (let dx = -dist; dx <= dist; dx++) {
      if (chebyshev(dx, dy, 0, 0) !== dist) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      spots.push({ x: nx, y: ny });
    }
  }
  return spots;
}

async function blockedSet(sql: Sql) {
  const camps = await sql<Row>`select x, y, sanctuary from tribes`;
  const bandits = await sql<Row>`select x, y from bandits`;
  const outlaws = await sql<Row>`select x, y from saalik`;
  const blocked = new Set<string>();
  for (const camp of camps) {
    const cx = num(camp.x);
    const cy = num(camp.y);
    blocked.add(key(cx, cy));
    for (const spot of ring(cx, cy, 1)) blocked.add(key(spot.x, spot.y));
  }
  for (const b of bandits) blocked.add(key(num(b.x), num(b.y)));
  for (const s of outlaws) blocked.add(key(num(s.x), num(s.y)));
  return { blocked, camps, bandits };
}

function spiralFree(blocked: Set<string>, salt: number) {
  const sx = salt % WORLD;
  const sy = Math.floor(salt / 7) % WORLD;
  if (!blocked.has(key(sx, sy))) return { x: sx, y: sy };
  for (let r = 1; r < WORLD; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx;
        const y = sy + dy;
        if (!inBounds(x, y)) continue;
        if (!blocked.has(key(x, y))) return { x, y };
      }
    }
  }
  return null;
}

async function insertBandit(sql: Sql, x: number, y: number, tier: number) {
  const kit = banditKit(tier);
  await sql`
    insert into bandits (x, y, tier, infantry, cavalry, gold, food, water, wood, stone)
    values (${x}, ${y}, ${kit.tier}, ${kit.infantry}, ${kit.cavalry}, ${kit.gold}, ${kit.food}, ${kit.water}, ${kit.wood}, ${kit.stone})
    on conflict (x, y) do nothing
  `;
}

async function spawnBandits(sql: Sql) {
  const countRows = await sql<Row>`select count(*)::int as n from bandits`;
  const n = num(countRows[0]?.n);
  if (n >= BANDIT_MAX) return;
  const claimed = await sql<Row>`
    update world_meta
    set last_spawn = now()
    where id = 1 and last_spawn <= now() - make_interval(secs => ${BANDIT_SPAWN_SEC})
    returning id
  `;
  if (!claimed.length) return;
  const batch = Math.min(n < BANDIT_MIN ? BANDIT_MIN - n : 2, BANDIT_MAX - n);
  for (let i = 0; i < batch; i++) {
    const { blocked, camps } = await blockedSet(sql);
    const salt = (Date.now() + i * 97) >>> 0;
    let spot: { x: number; y: number } | null = null;
    if (camps.length) {
      const camp = camps[salt % camps.length]!;
      const dist = 3;
      const opts = ring(num(camp.x), num(camp.y), dist).filter((p) => !blocked.has(key(p.x, p.y)));
      if (opts.length) spot = opts[(salt >>> 3) % opts.length] ?? null;
    }
    spot ??= spiralFree(blocked, salt);
    if (!spot) break;
    const tier = salt % 11 === 0 ? 3 : salt % 3 === 0 ? 2 : 1;
    await insertBandit(sql, spot.x, spot.y, tier);
  }
}

async function ensureSheikhs(sql: Sql) {
  const rows = await sql<Row>`select user_id from tribes where sheikh_name = ''`;
  for (const row of rows) {
    const id = String(row.user_id);
    const salt = hashStr(id);
    await sql`
      update tribes set
        sheikh_name = ${SHEIKH_NAMES[salt % SHEIKH_NAMES.length]},
        sheikh_trait = ${SHEIKH_TRAITS[salt % SHEIKH_TRAITS.length]}
      where user_id = ${id} and sheikh_name = ''
    `;
  }
}

async function spawnSaalik(sql: Sql) {
  const countRows = await sql<Row>`select count(*)::int as n from saalik`;
  const n = num(countRows[0]?.n);
  if (n >= SAALIK_MAX) return;
  for (let i = n; i < SAALIK_MAX; i++) {
    const { blocked } = await blockedSet(sql);
    const extra = await sql<Row>`select x, y from saalik`;
    for (const row of extra) blocked.add(key(num(row.x), num(row.y)));
    const spot = spiralFree(blocked, (Date.now() + i * 131) >>> 0);
    if (!spot) break;
    const offer = saalikOffer(i + Date.now());
    await sql`
      insert into saalik (name, line, x, y, cavalry, gold, food)
      values (${offer.name}, ${offer.line}, ${spot.x}, ${spot.y}, ${offer.cavalry}, ${offer.gold}, ${offer.food})
      on conflict (x, y) do nothing
    `;
  }
}

async function tick(sql: Sql) {
  await ensureSheikhs(sql);
  await ensureFields(sql);
  await finishBuilds(sql);
  await finishFields(sql);
  await finishClaims(sql);
  await ensurePastures(sql);
  await finishExpand(sql);
  await finishStudies(sql);
  await accrue(sql);
  await finishTraining(sql);
  await finishMoves(sql);
  await releaseOccupiers(sql);
  await resolveMarches(sql);
  await raids(sql);
  await spawnBandits(sql);
  await spawnSaalik(sql);
}

async function snapshot(sql: Sql, userId: string): Promise<WorldSnapshot> {
  const now = Date.now();
  const pasture = await readPastures(sql, now);
  const tribes = await sql<Row>`select * from tribes`;
  const buildings = await sql<Row>`select user_id, kind, level, upgrade_until from buildings`;
  const trainings = await sql<Row>`select user_id, kind, qty, finish_at from trainings`;
  const banditRows = await loadBandits(sql);
  const marchRows = await sql<Row>`
    select * from marches where status in ('march', 'return', 'occupy', 'resolving')
  `;
  const reportRows = await sql<Row>`
    select id, kind, title, body, victory, created_at, seen
    from reports
    where user_id = ${userId}
    order by id desc
    limit 30
  `;
  const studyRows = await sql<Row>`select user_id, kind, finish_at, done from studies`;

  const levelsBy = new Map<string, Record<BuildingKind, number>>();
  const buildViews = new Map<string, BuildingView[]>();
  for (const row of buildings) {
    const id = String(row.user_id);
    const kind = String(row.kind) as BuildingKind;
    if (!BUILDING_KINDS.includes(kind)) continue;
    const bag = levelsBy.get(id) ?? emptyLevels(0);
    bag[kind] = num(row.level);
    levelsBy.set(id, bag);
    const list = buildViews.get(id) ?? [];
    list.push({ kind, level: num(row.level), upgradeUntil: epoch(row.upgrade_until) });
    buildViews.set(id, list);
  }

  const flagsBy = new Map<string, string[]>();
  const studyViews = new Map<string, StudyView[]>();
  for (const row of studyRows) {
    const id = String(row.user_id);
    const kind = String(row.kind);
    if (!STUDY_KINDS.includes(kind as StudyKind)) continue;
    if (flag(row.done)) {
      const list = flagsBy.get(id) ?? [];
      list.push(kind);
      flagsBy.set(id, list);
    }
    const views = studyViews.get(id) ?? [];
    views.push({
      kind: kind as StudyKind,
      done: flag(row.done),
      finishAt: epoch(row.finish_at),
    });
    studyViews.set(id, views);
  }

  const names = new Map<string, string>();
  const camps: PublicCamp[] = [];
  let you: YouState | null = null;
  let me: Row | null = null;

  for (const tribe of tribes) {
    const id = String(tribe.user_id);
    names.set(id, String(tribe.name));
    const levels = levelsBy.get(id) ?? emptyLevels(1);
    const flags = flagsOf(flagsBy.get(id) ?? []);
    const power = armyPower(num(tribe.infantry), num(tribe.cavalry)) + defenseOf(levels.tent, flags.rampart);
    const peaceUntil = epoch(tribe.peace_until);
    camps.push({
      id,
      name: String(tribe.name),
      x: num(tribe.x),
      y: num(tribe.y),
      sanctuary: num(tribe.sanctuary),
      tent: levels.tent,
      peace: peaceUntil != null && peaceUntil > now,
      band: powerBand(power),
      own: id === userId,
      moving: epoch(tribe.move_until) != null,
      sheikh: String(tribe.sheikh_name || "شيخ"),
      people: lineageBy(String(tribe.lineage))?.name ?? "",
      structures: BUILDING_KINDS.filter((kind) => (levels[kind] ?? 0) > 0).length,
    });
    if (id === userId) me = tribe;
  }

  if (me) {
    const id = String(me.user_id);
    const levels = levelsBy.get(id) ?? emptyLevels(1);
    const flags = flagsOf(flagsBy.get(id) ?? []);
    const trainingRow = trainings.find((t) => String(t.user_id) === id);
    const away = marchRows
      .filter((m) => String(m.attacker_id) === id && m.status !== "done")
      .reduce((sum, m) => sum + num(m.infantry) + num(m.cavalry), 0);
    const moveUntil = epoch(me.move_until);
    const mineFields = await loadFields(sql, id);
    const baseRates = applyStudies(
      ratesPerMin(
        levels,
        num(me.sanctuary),
        mineFields.map((field) => ({ good: field.good, level: field.level })),
      ),
      flags,
    );
    const traitRates =
      played(me) === "water"
        ? { ...baseRates, water: Math.round(baseRates.water * traitFactor("water", num(me.renown))) }
        : baseRates;
    const extra = pastureYield(pasture.states, id, me.lineage);
    const rates = {
      ...traitRates,
      water: traitRates.water + extra.water,
      food: traitRates.food + extra.food,
      wood: traitRates.wood + extra.wood,
      stone: traitRates.stone + extra.stone,
    };
    const claimUntil = epoch(me.claim_until);
    const mineStates = pasture.states.filter((state) => state.userId === id);
    const chain: ChainView = {
      limit: chainLimit(num(me.cavalry), num(me.renown)),
      owned: mineStates.length,
      live: mineStates.filter((state) => state.producing).length,
      water: extra.water,
      food: extra.food,
      wood: extra.wood,
      stone: extra.stone,
      claim: claimUntil != null ? { x: num(me.claim_x), y: num(me.claim_y), until: claimUntil } : null,
    };
    you = {
      name: String(me.name),
      x: num(me.x),
      y: num(me.y),
      water: num(me.water),
      food: num(me.food),
      gold: num(me.gold),
      wood: num(me.wood),
      stone: num(me.stone),
      people: num(me.people),
      peopleCap: peopleCap(levels.tent || 1),
      armyCap: armyCap(levels.tent || 1),
      infantry: num(me.infantry),
      cavalry: num(me.cavalry),
      sanctuary: num(me.sanctuary),
      peaceUntil: epoch(me.peace_until),
      attacked: flag(me.attacked),
      peaceExtends: num(me.peace_extends),
      movesDone: num(me.moves_done),
      expandUntil: epoch(me.expand_until),
      move: moveUntil != null ? { x: num(me.move_x), y: num(me.move_y), until: moveUntil } : null,
      buildings: BUILDING_KINDS.map((kind) => {
        const found = (buildViews.get(id) ?? []).find((b) => b.kind === kind);
        return found ?? { kind, level: kind === "tent" ? 1 : 0, upgradeUntil: null };
      }),
      fields: mineFields,
      training: trainingRow
        ? {
            kind: trainingRow.kind === "cavalry" ? "cavalry" : "infantry",
            qty: num(trainingRow.qty),
            finishAt: epoch(trainingRow.finish_at) ?? now,
          }
        : null,
      rates,
      storageCap: storageCap(levels.storehouse),
      goldCap: capsOf(levels).gold,
      outbound: away,
      studies: STUDY_KINDS.map((kind) => {
        const found = (studyViews.get(id) ?? []).find((study) => study.kind === kind);
        return found ?? { kind, done: false, finishAt: null };
      }),
      sheikh: String(me.sheikh_name || "شيخ"),
      trait: asTrait(me.sheikh_trait),
      lineage: lineageBy(me.lineage) ? String(me.lineage) : "",
      poet: lineageBy(me.lineage) ? poetLine(lineageBy(me.lineage)!) : "",
      renown: num(me.renown),
      pacts: num(me.saalik_pacts),
      oaths: await oathBoard(sql, id, levels.well, num(me.cavalry)),
      guide: await guideClaims(sql, id),
      trades: num(me.trades),
      chain,
    };
  }

  const banditName = new Map<number, string>();
  const bandits: PublicBandit[] = banditRows.map((b) => {
    const id = num(b.id);
    const label = banditLabel(num(b.tier));
    banditName.set(id, label);
    return {
      id,
      x: num(b.x),
      y: num(b.y),
      tier: num(b.tier),
      label,
      band: powerBand(armyPower(num(b.infantry), num(b.cavalry))),
    };
  });

  const saalikRows = await sql<Row>`select id, name, line, x, y, cavalry, gold, food from saalik order by id`;
  const saalikName = new Map<number, string>();
  const saalik: PublicSaalik[] = saalikRows.map((row) => {
    const id = num(row.id);
    saalikName.set(id, String(row.name));
    return {
      id,
      x: num(row.x),
      y: num(row.y),
      name: String(row.name),
      line: String(row.line),
      cavalry: num(row.cavalry),
      gold: num(row.gold),
      food: num(row.food),
    };
  });

  const mineCells = new Set(
    pasture.states.filter((state) => state.userId === userId).map((state) => cellKey(state.x, state.y)),
  );
  const marches: PublicMarch[] = [];
  for (const march of marchRows) {
    if (march.status !== "march" && march.status !== "return" && march.status !== "occupy") continue;
    const attackerId = String(march.attacker_id);
    const onMine = mineCells.has(cellKey(num(march.to_x), num(march.to_y)));
    const incoming =
      (march.target_kind === "player" && String(march.target_id) === userId && march.status === "march") ||
      (march.target_kind === "tile" && onMine && attackerId !== userId && march.status !== "return");
    const outgoing = attackerId === userId && (march.status === "march" || march.status === "return" || march.status === "occupy");
    const purposeRaw = String(march.purpose ?? "attack");
    const masked = flag(march.masked);
    if (masked && !outgoing && !incoming) continue;
    const hidden = masked && !outgoing;
    const targetName =
      march.target_kind === "bandit"
        ? (banditName.get(num(march.target_id)) ?? "معسكر خلا")
        : march.target_kind === "saalik"
          ? (saalikName.get(num(march.target_id)) ?? "صعلوك رحل")
          : march.target_kind === "tile"
            ? "مرعى"
            : (names.get(String(march.target_id)) ?? "قبيلة");
    marches.push({
      id: num(march.id),
      role: outgoing ? "out" : incoming ? "in" : "watch",
      phase: march.status === "return" ? "return" : "march",
      purpose: purposeRaw === "scout" ? "scout" : purposeRaw === "spoil" ? "spoil" : "attack",
      attackerName: hidden ? "غارة ليل" : (names.get(attackerId) ?? "قبيلة"),
      targetName,
      fromX: hidden ? num(march.to_x) : num(march.from_x),
      fromY: hidden ? num(march.to_y) : num(march.from_y),
      toX: num(march.to_x),
      toY: num(march.to_y),
      departAt: epoch(march.depart_at) ?? now,
      arriveAt: epoch(march.arrive_at) ?? now,
      infantry: outgoing ? num(march.infantry) : null,
      cavalry: outgoing ? num(march.cavalry) : null,
    });
  }

  const clashRows = await sql<Row>`
    select id, x, y, attacker_name, defender_name, attacker_wins, summary, created_at
    from clashes
    where created_at > now() - interval '3 minutes'
    order by id desc
    limit 6
  `;
  const clashes: PublicClash[] = clashRows.map((row) => ({
    id: num(row.id),
    x: num(row.x),
    y: num(row.y),
    attacker: String(row.attacker_name),
    defender: String(row.defender_name),
    attackerWins: flag(row.attacker_wins),
    summary: String(row.summary),
    createdAt: epoch(row.created_at) ?? now,
  }));

  const intelRows = userId
    ? await sql<Row>`
        select target_kind, target_id, detail, expires_at
        from intel
        where user_id = ${userId} and expires_at > now()
      `
    : [];
  const intel: IntelView[] = intelRows.map((row) => ({
    targetKind: String(row.target_kind) === "bandit" ? "bandit" : "player",
    targetId: String(row.target_id),
    detail: String(row.detail),
    until: epoch(row.expires_at) ?? now,
  }));

  const reports: ReportView[] = reportRows.map((row) => ({
    id: num(row.id),
    kind: String(row.kind),
    title: String(row.title),
    body: String(row.body),
    victory: row.victory == null ? null : flag(row.victory),
    createdAt: epoch(row.created_at) ?? now,
    seen: flag(row.seen),
  }));

  return {
    serverNow: now,
    you,
    camps,
    bandits,
    saalik,
    marches,
    clashes,
    intel,
    reports,
    pastures: publishPastures(pasture.states, userId),
    unread: reports.filter((r) => !r.seen).length,
    playerCount: tribes.length,
    clock: clockOf(now),
  };
}

async function placeNear(sql: Sql, x: number, y: number) {
  const { blocked } = await blockedSet(sql);
  const opts = ring(x, y, 2).filter((p) => !blocked.has(key(p.x, p.y)));
  const spot = opts.length ? opts[hashStr(`${x}:${y}`) % opts.length] : null;
  if (!spot) return;
  await insertBandit(sql, spot.x, spot.y, 1);
}

async function found(
  sql: Sql,
  userId: string,
  input: { name: string; sheikh: string; trait: string; lineage?: string },
): Promise<string | null> {
  const name = cleanName(input.name);
  if (!name) return "الاسم حرفان إلى ثمانية عشر، من غير رموز.";
  const sheikh = cleanName(input.sheikh);
  if (!sheikh) return "اسم الشيخ حرفان إلى ثمانية عشر.";
  const line = lineageBy(input.lineage);
  const trait = line ? line.trait : input.trait;
  if (!isSheikhTrait(trait)) return "خصلة الشيخ غير معروفة.";
  const mine = await sql<Row>`select user_id from tribes where user_id = ${userId}`;
  if (mine.length) {
    await ensureBuildings(sql, userId);
    return null;
  }
  const taken = await sql<Row>`select user_id from tribes where lower(name) = lower(${name})`;
  if (taken.length) return "هذا الاسم محمول في الوادي.";

  const { blocked } = await blockedSet(sql);
  const camps = await sql<Row>`select x, y from tribes`;
  for (const camp of camps) {
    for (const spot of ring(num(camp.x), num(camp.y), 2)) blocked.add(key(spot.x, spot.y));
  }
  const pastureCells = await sql<Row>`select x, y from pastures`;
  for (const cell of pastureCells) blocked.add(key(num(cell.x), num(cell.y)));
  let spot: { x: number; y: number } | null = null;
  const salt = hashStr(userId);
  for (let i = 0; i < WORLD * WORLD && !spot; i++) {
    const trial = spiralFree(blocked, salt + i * 17);
    if (!trial) break;
    const neighbor = bestPastureNeighbor(trial.x, trial.y, (px, py) => blocked.has(key(px, py)));
    if (neighbor) spot = trial;
    else blocked.add(key(trial.x, trial.y));
  }
  if (!spot) return "الوادي ممتلئ. لا موضع لمضارب جديدة.";

  try {
    await sql`
      insert into tribes (
        user_id, name, x, y, water, food, gold, wood, stone, people, infantry, cavalry,
        peace_until, sanctuary, last_tick, sheikh_name, sheikh_trait, lineage, renown
      ) values (
        ${userId}, ${name}, ${spot.x}, ${spot.y},
        ${START.water}, ${START.food}, ${START.gold}, ${START.wood}, ${START.stone}, ${START.people},
        ${START.infantry}, ${START.cavalry},
        now() + make_interval(mins => ${START.peaceMin}),
        ${START.sanctuary},
        now(),
        ${sheikh}, ${trait}, ${line ? String(input.lineage) : ""}, 0
      )
    `;
  } catch {
    return "تعذّر نصب المضارب. جرّب اسماً آخر.";
  }
  await ensureBuildings(sql, userId);
  const granted = await grantStarter(sql, userId, spot.x, spot.y);
  await placeNear(sql, spot.x, spot.y);
  const pastureLine = granted
    ? `أول مرعى: ${pastureBase(granted.x, granted.y).good === "water" ? "مجرى" : pastureBase(granted.x, granted.y).good === "food" ? "واحة" : pastureBase(granted.x, granted.y).good === "wood" ? "عشب" : "كثيب"} عند ${granted.x}، ${granted.y}.`
    : "لا مربع مورد ملاصق. ضم من الخريطة حين يجاورك مجرى أو واحة أو عشب أو كثيب.";
  await writeReport(
    sql,
    userId,
    "found",
    "نُصبت المضارب",
    said(
      `خرجت ${name} من أثر السد، وحطّت في الوادي. شيخها ${sheikh}${line ? `، وشاعرها ${poetLine(line)}` : ""}. ${line ? line.gift : ""} ${pastureLine} درع المبتدئ قائم ${START.peaceMin} دقيقة. قتال العصابات والصعاليك لا يُسقطه، ومهاجمة مضارب قبيلة أخرى تُسقطه.`,
    ),
    true,
  );
  return null;
}

async function requireTribe(sql: Sql, userId: string) {
  const rows = await sql<Row>`select * from tribes where user_id = ${userId}`;
  return rows[0] ?? null;
}

function cellBlockedFor(
  camps: Row[],
  bandits: Row[],
  pastures: Row[],
  userId: string,
  x: number,
  y: number,
) {
  for (const camp of camps) {
    if (String(camp.user_id) === userId) continue;
    if (num(camp.x) === x && num(camp.y) === y) return "في هذا الموضع مضارب.";
    if (chebyshev(num(camp.x), num(camp.y), x, y) <= 1) return "ملاصق لمضارب قبيلة أخرى.";
  }
  if (pastures.some((cell) => num(cell.x) === x && num(cell.y) === y)) return "هذا المربع داخل سلسلة.";
  if (bandits.some((b) => num(b.x) === x && num(b.y) === y)) return "معسكر قطّاع طرق يحتلّ هذا الموضع.";
  return null;
}

async function withWorld(userId: string, fn: (sql: Sql) => Promise<string | null>): Promise<GameResult> {
  return locked(async () => {
    const sql = await getSql();
    await tick(sql);
    const error = await fn(sql);
    if (error) return { ok: false, error };
    return { ok: true, world: await snapshot(sql, userId) };
  });
}

export function loadWorld(userId: string) {
  return locked(async () => {
    const sql = await getSql();
    await tick(sql);
    return snapshot(sql, userId);
  });
}

export function foundTribe(userId: string, input: { name: string; sheikh: string; trait: string; lineage?: string }) {
  return withWorld(userId, (sql) => found(sql, userId, input));
}

export function startUpgrade(userId: string, kind: string) {
  return withWorld(userId, async (sql) => {
    if (!BUILDING_KINDS.includes(kind as BuildingKind)) return "مبنى غير معروف.";
    const building = kind as BuildingKind;
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    const rows = await sql<Row>`select level, upgrade_until from buildings where user_id = ${userId} and kind = ${building}`;
    const row = rows[0];
    if (!row) return "المبنى غير موجود.";
    if (epoch(row.upgrade_until) != null) return "هذا المبنى قيد التطوير.";
    if (await villageBusy(sql, userId)) return "الرفع جارٍ في موضع آخر.";
    const level = num(row.level);
    if (level >= BUILDINGS[building].max) return "بلغ هذا المبنى غايته.";
    const cost = upgradeCost(building, level + 1);
    if (!(await spend(sql, userId, cost))) return "الموارد لا تكفي.";
    const until = new Date(Date.now() + workSeconds(tribe.lineage, cost.seconds) * 1000);
    const updated = await sql<Row>`
      update buildings set upgrade_until = ${until}
      where user_id = ${userId} and kind = ${building} and upgrade_until is null and level = ${level}
      returning kind
    `;
    if (!updated.length) {
      await refund(sql, userId, cost);
      return "تعذّر بدء التطوير.";
    }
    return null;
  });
}

export function startStudy(userId: string, kind: string) {
  return withWorld(userId, async (sql) => {
    if (!STUDY_KINDS.includes(kind as StudyKind)) return "دراسة غير معروفة.";
    const study = kind as StudyKind;
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    const levels = await columnMap(sql, userId);
    if (!studyOpen(levels, study)) return STUDIES[study].needs;
    const existing = await sql<Row>`select done, finish_at from studies where user_id = ${userId} and kind = ${study}`;
    const row = existing[0];
    if (row && flag(row.done)) return "أُنجزت هذه الدراسة.";
    if (row && epoch(row.finish_at) != null) return "هذه الدراسة قيد الإتمام.";
    const other = await sql<Row>`
      select kind from studies
      where user_id = ${userId} and done = false and finish_at is not null
    `;
    if (other.length) return "دراسة أخرى قيد الإتمام.";
    const cost = STUDIES[study].cost;
    if (!(await spend(sql, userId, cost))) return "الموارد لا تكفي للديوان.";
    const until = new Date(Date.now() + workSeconds(tribe.lineage, cost.seconds) * 1000);
    const inserted = await sql<Row>`
      insert into studies (user_id, kind, finish_at, done)
      values (${userId}, ${study}, ${until}, false)
      on conflict (user_id, kind) do nothing
      returning kind
    `;
    if (!inserted.length) {
      await refund(sql, userId, cost);
      return "تعذّر فتح الدراسة.";
    }
    return null;
  });
}

export function expandSanctuary(userId: string) {
  return withWorld(userId, async (sql) => {
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    return "الحمى يُضم من الخريطة، مربعاً ملاصقاً لسلسلتك.";
  });
}

export function claimPasture(userId: string, x: number, y: number) {
  return withWorld(userId, async (sql) => {
    if (!inBounds(x, y)) return "هذا الموضع خارج الوادي.";
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    if (epoch(tribe.claim_until) != null) return "ضمّ مربع جارٍ.";
    if (num(tribe.x) === x && num(tribe.y) === y) return "هذه الديرة، لا تُضم.";
    const dirah = await sql<Row>`select user_id from tribes where x = ${x} and y = ${y}`;
    if (dirah.length) return "هنا مضارب، لا مرعى.";
    const mine = await sql<Row>`select x from pastures where user_id = ${userId} and x = ${x} and y = ${y}`;
    if (mine.length) return "هذا المربع في سلسلتك.";
    const pasture = await readPastures(sql, Date.now());
    const bridges = pasture.states
      .filter((state) => state.userId === userId && state.bridge)
      .map((state) => ({ x: state.x, y: state.y }));
    const steps = claimSteps({ x: num(tribe.x), y: num(tribe.y) }, bridges, { x, y });
    if (steps == null) return "لا يُضم إلا مربع ملاصق لديرة أو لدرب متصل.";
    const cost = claimCost(steps);
    if (!(await spend(sql, userId, cost))) return "الطعام أو الذهب لا يكفي للضم.";
    const until = new Date(Date.now() + workSeconds(tribe.lineage, cost.seconds) * 1000);
    const updated = await sql<Row>`
      update tribes set
        claim_x = ${x},
        claim_y = ${y},
        claim_food = ${cost.food},
        claim_gold = ${cost.gold},
        claim_until = ${until}
      where user_id = ${userId} and claim_until is null
      returning user_id
    `;
    if (!updated.length) {
      await refund(sql, userId, cost);
      return "تعذّر بدء الضم.";
    }
    return null;
  });
}

export function releasePasture(userId: string, x: number, y: number) {
  return withWorld(userId, async (sql) => {
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    const removed = await sql<Row>`
      delete from pastures where user_id = ${userId} and x = ${x} and y = ${y} returning x
    `;
    if (!removed.length) return "هذا المربع ليس في سلسلتك.";
    if (num(tribe.claim_x) === x && num(tribe.claim_y) === y) {
      await returnClaim(sql, userId);
    }
    return null;
  });
}

export function spoilPasture(userId: string, x: number, y: number, infantryRaw: number, cavalryRaw: number) {
  return withWorld(userId, async (sql) => {
    if (!inBounds(x, y)) return "هذا الموضع خارج الوادي.";
    const infantry = Math.floor(infantryRaw);
    const cavalry = Math.floor(cavalryRaw);
    if (!Number.isFinite(infantry) || !Number.isFinite(cavalry) || infantry < 0 || cavalry < 0 || infantry + cavalry < 1 || infantry > 400 || cavalry > 400) {
      return "عدد الجند غير صالح.";
    }
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    if (num(tribe.x) === x && num(tribe.y) === y) return "الموارد تُغزى من مضارب القبيلة، لا بإسكات الديرة.";
    const owners = await sql<Row>`select user_id from pastures where x = ${x} and y = ${y}`;
    if (!owners.length) return "هذا المربع مشاع، ليس حمى.";
    const foreign = owners.map((row) => String(row.user_id)).filter((id) => id !== userId);
    const mine = owners.some((row) => String(row.user_id) === userId);
    if (!mine && !foreign.length) return "لا حمى على هذا المربع.";
    if (foreign.length) {
      for (const ownerId of foreign) {
        const rows = await sql<Row>`select peace_until from tribes where user_id = ${ownerId}`;
        const peace = epoch(rows[0]?.peace_until);
        if (peace != null && peace > Date.now()) return "درع المبتدئ يحمي هذا المرعى.";
      }
    }
    const dropPeace = foreign.length > 0;
    const sent = dropPeace
      ? await sql<Row>`
          update tribes set
            infantry = infantry - ${infantry},
            cavalry = cavalry - ${cavalry},
            attacked = true,
            peace_until = null
          where user_id = ${userId}
            and infantry >= ${infantry}
            and cavalry >= ${cavalry}
          returning x, y, sheikh_trait, renown
        `
      : await sql<Row>`
          update tribes set
            infantry = infantry - ${infantry},
            cavalry = cavalry - ${cavalry}
          where user_id = ${userId}
            and infantry >= ${infantry}
            and cavalry >= ${cavalry}
          returning x, y, sheikh_trait, renown
        `;
    const from = sent[0];
    if (!from) return "الجند في المضارب أقل من ذلك.";
    const flags = await studyFlags(sql, userId);
    const sec = paceOf(
      distance(num(from.x), num(from.y), x, y),
      flags.scouts,
      played(tribe) ?? "guard",
      num(from.renown),
    );
    const mask = isNight(Date.now()) && num(tribe.saalik_pacts) > 0;
    await sql`
      insert into marches (
        attacker_id, target_kind, target_id, infantry, cavalry,
        from_x, from_y, to_x, to_y, depart_at, arrive_at, status, purpose, masked
      ) values (
        ${userId}, 'tile', ${`${x}:${y}`}, ${infantry}, ${cavalry},
        ${num(from.x)}, ${num(from.y)}, ${x}, ${y},
        now(), now() + make_interval(secs => ${sec}), 'march', 'spoil', ${mask}
      )
    `;
    return null;
  });
}

export function extendPeace(userId: string) {
  return withWorld(userId, async (sql) => {
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    if (flag(tribe.attacked)) return "من هاجم قبيلة لا يرجع إلى درع المبتدئ.";
    const cost = peaceExtendCost(num(tribe.peace_extends));
    const ahead = MAX_PEACE_AHEAD_MS / 1000 - PEACE_EXTEND_MIN * 60;
    const updated = await sql<Row>`
      update tribes set
        gold = gold - ${cost.gold},
        peace_extends = peace_extends + 1,
        peace_until = greatest(now(), coalesce(peace_until, now())) + make_interval(mins => ${PEACE_EXTEND_MIN})
      where user_id = ${userId}
        and attacked = false
        and gold >= ${cost.gold}
        and (peace_until is null or peace_until < now() + make_interval(secs => ${Math.floor(ahead)}))
      returning user_id
    `;
    if (!updated.length) return "لا يمكن مدّ الدرع الآن. إمّا أن الذهب لا يكفي، أو الدرع طويل.";
    return null;
  });
}

export function startMove(userId: string, x: number, y: number) {
  return withWorld(userId, async (sql) => {
    if (!inBounds(x, y)) return "هذا الموضع خارج الوادي.";
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    if (epoch(tribe.move_until) != null) return "المضارب في الطريق أصلًا.";
    if (num(tribe.x) === x && num(tribe.y) === y) return "أنت هنا.";
    const camps = await sql<Row>`select user_id, x, y, sanctuary from tribes`;
    const bandits = await sql<Row>`select x, y from bandits`;
    const pastures = await sql<Row>`select x, y from pastures`;
    const blocked = cellBlockedFor(camps, bandits, pastures, userId, x, y);
    if (blocked) return blocked;
    const outlaw = await sql<Row>`select id from saalik where x = ${x} and y = ${y}`;
    if (outlaw.length) return "صعلوك يقف في هذا الموضع. بايعه أو واجهه.";
    const quote = moveQuote(distance(num(tribe.x), num(tribe.y), x, y), num(tribe.moves_done));
    const spent = await sql<Row>`
      update tribes set
        gold = gold - ${quote.gold},
        move_x = ${x},
        move_y = ${y},
        move_cost = ${quote.gold},
        move_until = now() + make_interval(secs => ${quote.seconds})
      where user_id = ${userId}
        and move_until is null
        and gold >= ${quote.gold}
      returning user_id
    `;
    if (!spent.length) return "الذهب لا يكفي للنقل.";
    return null;
  });
}

export function train(userId: string, kind: string, qtyRaw: number) {
  return withWorld(userId, async (sql) => {
    if (kind !== "infantry" && kind !== "cavalry") return "صنف غير معروف.";
    const troop = kind as TroopKind;
    const qty = Math.floor(qtyRaw);
    if (qty < 1 || qty > 80) return "درّب بين واحد وثمانين.";
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    const levels = await columnMap(sql, userId);
    if (levels.barracks < 1) return "ابْنِ الثكنة أولًا.";
    const busy = await sql<Row>`select id from trainings where user_id = ${userId}`;
    if (busy.length) return "الثكنة مشغولة.";
    const awayRows = await sql<Row>`
      select coalesce(sum(infantry + cavalry), 0)::int as n
      from marches
      where attacker_id = ${userId} and status in ('march', 'return', 'occupy', 'resolving')
    `;
    const away = num(awayRows[0]?.n);
    const home = num(tribe.infantry) + num(tribe.cavalry);
    if (home + away + qty > armyCap(levels.tent || 1)) return "الجيش بلغ حدّ خيمة الشيخ.";
    const cost = trainQuote(troop, qty, levels.barracks);
    if (!(await spend(sql, userId, cost))) return "الموارد أو السكان لا تكفي.";
    const until = new Date(Date.now() + workSeconds(tribe.lineage, cost.seconds) * 1000);
    await sql`
      insert into trainings (user_id, kind, qty, finish_at)
      values (${userId}, ${troop}, ${qty}, ${until})
    `;
    return null;
  });
}

async function finishScout(sql: Sql, march: Row, userId: string, attackerName: string) {
  const id = num(march.id);
  const kind = String(march.target_kind);
  const targetId = String(march.target_id);
  let detail = "لم تجد الطليعة أحداً في الموضع.";
  let title = "الطليعة عادت فارغة";
  if (kind === "bandit") {
    const rows = await sql<Row>`select * from bandits where id = ${num(targetId)}`;
    const bandit = rows[0];
    if (bandit) {
      const label = banditLabel(num(bandit.tier));
      detail = `المشاة ${num(bandit.infantry)}، والفرسان ${num(bandit.cavalry)}. قوتهم ${armyPower(num(bandit.infantry), num(bandit.cavalry))}. ${lootHint({
        water: num(bandit.water),
        food: num(bandit.food),
        gold: num(bandit.gold),
        wood: num(bandit.wood),
        stone: num(bandit.stone),
      })}.`;
      title = `طليعة على ${label}`;
    }
  } else {
    const rows = await sql<Row>`select user_id, name, infantry, cavalry, peace_until from tribes where user_id = ${targetId}`;
    const tribe = rows[0];
    if (tribe) {
      const levels = await columnMap(sql, targetId);
      const flags = await studyFlags(sql, targetId);
      const power = armyPower(num(tribe.infantry), num(tribe.cavalry)) + defenseOf(levels.tent || 1, flags.rampart);
      const peace = epoch(tribe.peace_until);
      const shielded = peace != null && peace > Date.now();
      detail = `المشاة ${num(tribe.infantry)}، والفرسان ${num(tribe.cavalry)}. هجومهم ${armyPower(num(tribe.infantry), num(tribe.cavalry))}. دفاع المضارب ${power}. ${shielded ? "الدرع قائم." : "لا درع."}`;
      title = `طليعة على ${String(tribe.name)}`;
      await writeReport(
        sql,
        targetId,
        "scout",
        `طليعة ${attackerName}`,
        `طليعة من ${attackerName} أطلت على المضارب ثم عادت. لم يُشهر سلاح.`,
        null,
      );
    }
  }
  await writeReport(sql, userId, "scout", title, `${detail} درعك لم يُمس.`, null);
  if (!detail.startsWith("لم تجد")) {
    await sql`
      insert into intel (user_id, target_kind, target_id, detail, expires_at)
      values (${userId}, ${kind}, ${targetId}, ${detail}, now() + make_interval(mins => ${SCOUT_HOLD_MIN}))
      on conflict (user_id, target_kind, target_id) do update
      set detail = excluded.detail, expires_at = excluded.expires_at
    `;
  }
  await sql`update marches set status = 'done' where id = ${id}`;
}

export function scout(userId: string, input: { targetKind: string; targetId: string }) {
  return withWorld(userId, async (sql) => {
    if (input.targetKind !== "player" && input.targetKind !== "bandit") return "هدف غير معروف.";
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    const busy = await sql<Row>`
      select id from marches
      where attacker_id = ${userId} and purpose = 'scout' and status in ('march', 'resolving')
    `;
    if (busy.length) return "طليعة في الطريق أصلاً.";
    let destX = 0;
    let destY = 0;
    let targetId = input.targetId;
    if (input.targetKind === "player") {
      if (input.targetId === userId) return "مضاربك تعرفها.";
      const target = await sql<Row>`select user_id, x, y from tribes where user_id = ${input.targetId}`;
      const row = target[0];
      if (!row) return "هذه القبيلة ليست في الوادي.";
      destX = num(row.x);
      destY = num(row.y);
      targetId = String(row.user_id);
    } else {
      const target = await sql<Row>`select id, x, y from bandits where id = ${Number(input.targetId)}`;
      const row = target[0];
      if (!row) return "هذا المعسكر خلا.";
      destX = num(row.x);
      destY = num(row.y);
      targetId = String(num(row.id));
    }
    const paid = await spend(sql, userId, {
      water: 0,
      food: 0,
      gold: SCOUT_GOLD,
      wood: 0,
      stone: 0,
      people: 0,
      seconds: 0,
    });
    if (!paid) return "الذهب لا يكفي للطليعة.";
    const flags = await studyFlags(sql, userId);
    const sec = scoutSeconds(distance(num(tribe.x), num(tribe.y), destX, destY), flags.scouts);
    await sql`
      insert into marches (
        attacker_id, target_kind, target_id, infantry, cavalry,
        from_x, from_y, to_x, to_y, depart_at, arrive_at, status, purpose
      ) values (
        ${userId}, ${input.targetKind}, ${targetId}, 0, 0,
        ${num(tribe.x)}, ${num(tribe.y)}, ${destX}, ${destY},
        now(), now() + make_interval(secs => ${sec}), 'march', 'scout'
      )
    `;
    return null;
  });
}

export function attack(
  userId: string,
  input: { targetKind: string; targetId: string; infantry: number; cavalry: number },
) {
  return withWorld(userId, async (sql) => {
    if (input.targetKind !== "player" && input.targetKind !== "bandit" && input.targetKind !== "saalik") {
      return "هدف غير معروف.";
    }
    const infantry = Math.floor(input.infantry);
    const cavalry = Math.floor(input.cavalry);
    if (infantry < 0 || cavalry < 0 || infantry + cavalry < 1 || infantry > 400 || cavalry > 400) {
      return "عدد الجند غير صالح.";
    }
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    let destX = 0;
    let destY = 0;
    let targetId = input.targetId;
    if (input.targetKind === "player") {
      if (input.targetId === userId) return "لا تهاجم مضاربك.";
      const target = await sql<Row>`select user_id, x, y, peace_until from tribes where user_id = ${input.targetId}`;
      const row = target[0];
      if (!row) return "هذه القبيلة ليست في الوادي.";
      const peace = epoch(row.peace_until);
      if (peace != null && peace > Date.now()) return "درع المبتدئ يحمي هذه القبيلة.";
      destX = num(row.x);
      destY = num(row.y);
      targetId = String(row.user_id);
    } else if (input.targetKind === "saalik") {
      const id = Number(input.targetId);
      const target = await sql<Row>`select id, x, y from saalik where id = ${id}`;
      const row = target[0];
      if (!row) return "هذا الصعلوك رحل.";
      destX = num(row.x);
      destY = num(row.y);
      targetId = String(num(row.id));
    } else {
      const id = Number(input.targetId);
      const target = await sql<Row>`select id, x, y from bandits where id = ${id}`;
      const row = target[0];
      if (!row) return "هذا المعسكر خلا.";
      destX = num(row.x);
      destY = num(row.y);
      targetId = String(num(row.id));
    }
    const dropShield = attackDropsShield(input.targetKind);
    const sent = await sql<Row>`
      update tribes set
        infantry = infantry - ${infantry},
        cavalry = cavalry - ${cavalry},
        attacked = case when ${dropShield}::boolean then true else attacked end,
        peace_until = case when ${dropShield}::boolean then null else peace_until end
      where user_id = ${userId}
        and infantry >= ${infantry}
        and cavalry >= ${cavalry}
      returning x, y
    `;
    const from = sent[0];
    if (!from) return "الجند في المضارب أقل من ذلك.";
    const flags = await studyFlags(sql, userId);
    const sec = paceOf(distance(num(from.x), num(from.y), destX, destY), flags.scouts, played(tribe) ?? "guard", num(tribe.renown));
    const mask = isNight(Date.now()) && num(tribe.saalik_pacts) > 0;
    await sql`
      insert into marches (
        attacker_id, target_kind, target_id, infantry, cavalry,
        from_x, from_y, to_x, to_y, depart_at, arrive_at, status, masked
      ) values (
        ${userId}, ${input.targetKind}, ${targetId}, ${infantry}, ${cavalry},
        ${num(from.x)}, ${num(from.y)}, ${destX}, ${destY},
        now(), now() + make_interval(secs => ${sec}), 'march', ${mask}
      )
    `;
    return null;
  });
}

export function hireSaalik(userId: string, rawId: number) {
  return withWorld(userId, async (sql) => {
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    const id = Math.floor(Number(rawId));
    if (!Number.isFinite(id)) return "صعلوك غير معروف.";
    const rows = await sql<Row>`select id, name, cavalry, gold, food from saalik where id = ${id}`;
    const man = rows[0];
    if (!man) return "هذا الصعلوك رحل.";
    const levels = await columnMap(sql, userId);
    const awayRows = await sql<Row>`
      select coalesce(sum(infantry + cavalry), 0)::int as n
      from marches
      where attacker_id = ${userId} and status in ('march', 'return', 'occupy', 'resolving')
    `;
    const away = num(awayRows[0]?.n);
    const home = num(tribe.infantry) + num(tribe.cavalry);
    const add = num(man.cavalry);
    if (add < 1) return "لم يبقَ مع هذا الصعلوك فارس.";
    if (home + away + add > armyCap(levels.tent || 1)) return "خيمة الشيخ لا تتسع لهؤلاء الفرسان.";
    const gold = num(man.gold);
    const food = num(man.food);
    const hired = await sql<Row>`
      update tribes set
        gold = gold - ${gold},
        food = food - ${food},
        cavalry = cavalry + ${add},
        renown = least(8, renown + 1),
        saalik_pacts = saalik_pacts + 1
      where user_id = ${userId}
        and gold >= ${gold}
        and food >= ${food}
      returning user_id
    `;
    if (!hired.length) return "الذهب أو الطعام لا يكفي للبيعة.";
    const gone = await sql<Row>`delete from saalik where id = ${id} returning id`;
    if (!gone.length) {
      await sql`
        update tribes set
          gold = gold + ${gold},
          food = food + ${food},
          cavalry = greatest(0, cavalry - ${add}),
          renown = greatest(0, renown - 1),
          saalik_pacts = greatest(0, saalik_pacts - 1)
        where user_id = ${userId}
      `;
      return "هذا الصعلوك رحل.";
    }
    await writeReport(
      sql,
      userId,
      "hire",
      `بيعة ${String(man.name)}`,
      `بايعك ${String(man.name)} بـ ${add} فرسان مقابل ${gold} ذهب و${food} طعام. الدرع لم يُمس، وصيت الشيخ علا. من المغرب إلى الفجر تخرج غارتك بلا اسم، وأصل السهم لا يراه غيرك. الطليعة تبقى باسمك.`,
      true,
    );
    return null;
  });
}

export function markReports(userId: string) {
  return withWorld(userId, async (sql) => {
    await sql`update reports set seen = true where user_id = ${userId} and seen = false`;
    return null;
  });
}

async function oathBoard(sql: Sql, userId: string, well: number, cavalry: number): Promise<OathView[]> {
  const claimedRows = await sql<Row>`select kind from oaths where user_id = ${userId}`;
  const claimed = new Set(claimedRows.map((row) => String(row.kind)));
  const seen = await sql<Row>`select id from reports where user_id = ${userId} and kind = 'scout' limit 1`;
  const sent = seen.length
    ? seen
    : await sql<Row>`select id from marches where attacker_id = ${userId} and purpose = 'scout' limit 1`;
  const done: Record<OathKind, boolean> = {
    well: well >= 1,
    host: cavalry >= 8,
    scout: sent.length > 0,
  };
  return (["well", "host", "scout"] as const).map((kind) => ({
    kind,
    done: done[kind],
    claimed: claimed.has(kind),
  }));
}

function goodCost(good: Good, qty: number): Cost {
  return {
    water: good === "water" ? qty : 0,
    food: good === "food" ? qty : 0,
    gold: good === "gold" ? qty : 0,
    wood: good === "wood" ? qty : 0,
    stone: good === "stone" ? qty : 0,
    people: 0,
    seconds: 0,
  };
}

export function claimOath(userId: string, kind: string) {
  return withWorld(userId, async (sql) => {
    if (!isOathKind(kind)) return "عهد غير معروف.";
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    const levels = await columnMap(sql, userId);
    const board = await oathBoard(sql, userId, levels.well, num(tribe.cavalry));
    const oath = board.find((item) => item.kind === kind);
    if (!oath?.done) return "لم يكتمل هذا العهد.";
    if (oath.claimed) return "قُبض هذا العهد.";
    const caps = capsOf(levels);
    const foodAdd = kind === "host" ? 50 : 0;
    const goldAdd = kind === "well" ? 60 : kind === "scout" ? 40 : 0;
    if (num(tribe.food) + foodAdd > caps.food) return "المخزن لا يتسع. ارفع المخزن لتأخذ الجائزة.";
    if (num(tribe.gold) + goldAdd > caps.gold) return "بيت المال لا يتسع. ارفع خيمة الشيخ لتأخذ الجائزة.";
    const inserted = await sql<Row>`
      insert into oaths (user_id, kind)
      values (${userId}, ${kind})
      on conflict (user_id, kind) do nothing
      returning kind
    `;
    if (!inserted.length) return "قُبض هذا العهد.";
    await sql`
      update tribes set food = food + ${foodAdd}, gold = gold + ${goldAdd}
      where user_id = ${userId}
    `;
    return null;
  });
}

export function barter(userId: string, input: { give: string; take: string; lots: number }) {
  return withWorld(userId, async (sql) => {
    if (!isGood(input.give) || !isGood(input.take) || input.give === input.take) return "اختر موردين مختلفين.";
    const lots = Math.floor(input.lots);
    if (lots < 1 || lots > BARTER_MAX_LOTS) return "البدل بين دفعة وثمانين.";
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    const giveQty = lots * BARTER_GIVE;
    const getQty = barterTake(tribe.lineage, lots);
    const levels = await columnMap(sql, userId);
    const cap = capsOf(levels)[input.take];
    if (num(tribe[input.take]) + getQty > cap) {
      return input.take === "gold" ? "بيت المال لا يتسع. ارفع خيمة الشيخ ثم بدّل." : "المخزن لا يتسع. ارفع المخزن ثم بدّل.";
    }
    const paid = await spend(sql, userId, goodCost(input.give, giveQty));
    if (!paid) return "ما معك لا يكفي للبدل.";
    const gain = goodCost(input.take, getQty);
    await sql`
      update tribes set
        water = water + ${gain.water},
        food = food + ${gain.food},
        gold = gold + ${gain.gold},
        wood = wood + ${gain.wood},
        stone = stone + ${gain.stone},
        trades = trades + 1
      where user_id = ${userId}
    `;
    return null;
  });
}

async function guideClaims(sql: Sql, userId: string): Promise<GuideKind[]> {
  const rows = await sql<Row>`select kind from guide_claims where user_id = ${userId}`;
  return rows.map((row) => String(row.kind)).filter(isGuideKind);
}

async function guideReady(sql: Sql, userId: string, kind: GuideKind) {
  const tribe = await requireTribe(sql, userId);
  if (!tribe) return false;
  const levels = await columnMap(sql, userId);
  if (kind === "camp") return true;
  if (kind === "pasture") {
    const rows = await sql<Row>`select user_id from pastures where user_id = ${userId} limit 1`;
    return rows.length > 0;
  }
  if (kind === "well") {
    const rows = await sql<Row>`select level from fields where user_id = ${userId} and good = 'water'`;
    if (rows.some((row) => num(row.level) >= 2)) return true;
    return levels.well >= 1;
  }
  if (kind === "farm") {
    const rows = await sql<Row>`select level from fields where user_id = ${userId} and good = 'food'`;
    if (rows.some((row) => num(row.level) >= 2)) return true;
    return levels.farm >= 1;
  }
  if (kind === "saalik") return num(tribe.cavalry) >= 8;
  if (kind === "market") return num(tribe.trades) >= 1;
  const seen = await sql<Row>`select id from reports where user_id = ${userId} and kind = 'scout' limit 1`;
  if (seen.length) return true;
  const sent = await sql<Row>`select id from marches where attacker_id = ${userId} and purpose = 'scout' limit 1`;
  return sent.length > 0;
}

export function claimGuide(userId: string, kind: string) {
  return withWorld(userId, async (sql) => {
    if (!isGuideKind(kind)) return "مهمة غير معروفة.";
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    if (!(await guideReady(sql, userId, kind))) return "لم تكتمل المهمة بعد.";
    const reward = GUIDE_REWARD[kind];
    const levels = await columnMap(sql, userId);
    const caps = capsOf(levels);
    if (num(tribe.gold) + reward.gold > caps.gold) return "بيت المال لا يتسع. ارفع خيمة الشيخ لتأخذ الهدية.";
    if (num(tribe.food) + reward.food > caps.food || num(tribe.wood) + reward.wood > caps.wood || num(tribe.stone) + reward.stone > caps.stone) {
      return "المخزن لا يتسع. ارفع المخزن لتأخذ الهدية.";
    }
    const inserted = await sql<Row>`
      insert into guide_claims (user_id, kind)
      values (${userId}, ${kind})
      on conflict (user_id, kind) do nothing
      returning kind
    `;
    if (!inserted.length) return "قُبضت هذه المكافأة.";
    await sql`
      update tribes set
        gold = gold + ${reward.gold},
        food = food + ${reward.food},
        wood = wood + ${reward.wood},
        stone = stone + ${reward.stone}
      where user_id = ${userId}
    `;
    return null;
  });
}

async function loadFields(sql: Sql, userId: string): Promise<FieldView[]> {
  const rows = await sql<Row>`select slot, good, level, upgrade_until from fields where user_id = ${userId} order by slot`;
  const bySlot = new Map(rows.map((row) => [num(row.slot), row]));
  return FIELD_SLOTS.map((slot) => {
    const row = bySlot.get(slot.slot);
    const good = String(row?.good ?? slot.good);
    const safe: FieldGood = good === "water" || good === "food" || good === "wood" || good === "stone" ? good : slot.good;
    return {
      slot: slot.slot,
      good: safe,
      level: row ? num(row.level) : slot.start,
      upgradeUntil: epoch(row?.upgrade_until),
    };
  });
}

export function startField(userId: string, slot: number) {
  return withWorld(userId, async (sql) => {
    const spec = FIELD_SLOTS.find((item) => item.slot === slot);
    if (!spec) return "حقل غير معروف.";
    const tribe = await requireTribe(sql, userId);
    if (!tribe) return "انصب مضاربك أولًا.";
    await ensureFields(sql);
    const rows = await sql<Row>`select level, upgrade_until from fields where user_id = ${userId} and slot = ${slot}`;
    const row = rows[0];
    if (!row) return "الحقل غير موجود.";
    if (epoch(row.upgrade_until) != null) return "هذا الحقل قيد الرفع.";
    if (await villageBusy(sql, userId)) return "الرفع جارٍ في موضع آخر.";
    const level = num(row.level);
    if (level >= FIELD_MAX) return "بلغ هذا الحقل غايته.";
    const cost = fieldCost(spec.good, level + 1);
    if (!(await spend(sql, userId, cost))) return "الموارد لا تكفي لرفع الحقل.";
    const until = new Date(Date.now() + workSeconds(tribe.lineage, cost.seconds) * 1000);
    const updated = await sql<Row>`
      update fields set upgrade_until = ${until}
      where user_id = ${userId} and slot = ${slot} and upgrade_until is null and level = ${level}
      returning slot
    `;
    if (!updated.length) {
      await refund(sql, userId, cost);
      return "تعذّر رفع الحقل.";
    }
    return null;
  });
}
