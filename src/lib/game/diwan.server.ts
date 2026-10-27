import { getSql, type Sql } from "@/lib/db";
import { isSteward, type Account } from "./steward";

type Row = Record<string, unknown>;

const MAX_BODY = 280;
const MAX_REPLY = 400;

export type DiwanGate = { steward: boolean; pending: number };

export type LetterView = {
  body: string;
  reply: string | null;
  createdAt: number;
  repliedAt: number | null;
  open: boolean;
};

export type DiwanTribe = {
  name: string;
  sheikh: string;
  lineage: string;
  x: number;
  y: number;
  water: number;
  food: number;
  gold: number;
  wood: number;
  stone: number;
  infantry: number;
  cavalry: number;
  renown: number;
  peace: boolean;
  pacts: number;
};

export type DiwanLetter = {
  id: number;
  tribe: string;
  body: string;
  createdAt: number;
  seen: boolean;
  reply: string | null;
  repliedAt: number | null;
};

export type DiwanBoard =
  | { ok: true; tribes: DiwanTribe[]; letters: DiwanLetter[] }
  | { ok: false; error: "closed" };

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function epoch(value: unknown) {
  if (value == null) return null;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? t : null;
}

function clean(text: string, max: number) {
  const body = text.replace(/\s+/g, " ").trim();
  if (body.length < 2 || body.length > max) return null;
  return body;
}

async function accountOf(sql: Sql, userId: string): Promise<Account | null> {
  try {
    const rows = await sql<Row>`select id, email, "emailVerified" as verified from "user" where id = ${userId}`;
    const row = rows[0];
    if (!row) return null;
    return { id: String(row.id), email: row.email ? String(row.email) : null, emailVerified: row.verified === true };
  } catch {
    return null;
  }
}

async function status(sql: Sql, userId: string) {
  return { steward: isSteward(await accountOf(sql, userId), process.env.ADMIN_EMAIL) };
}

export async function gate(userId: string): Promise<DiwanGate> {
  const sql = await getSql();
  const face = await status(sql, userId);
  if (!face.steward) return { ...face, pending: 0 };
  const rows = await sql<Row>`select count(*)::int as n from letters where reply is null and seen = false`;
  return { ...face, pending: num(rows[0]?.n) };
}

export async function myLetter(userId: string): Promise<LetterView | null> {
  const sql = await getSql();
  const rows = await sql<Row>`
    select body, reply, created_at, replied_at
    from letters
    where user_id = ${userId}
    order by id desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const reply = row.reply == null ? null : String(row.reply);
  return {
    body: String(row.body),
    reply,
    createdAt: epoch(row.created_at) ?? Date.now(),
    repliedAt: epoch(row.replied_at),
    open: reply == null,
  };
}

export async function sendLetter(userId: string, body: string): Promise<string | null> {
  const text = clean(body, MAX_BODY);
  if (!text) return "الرسالة حرفان إلى مئتين وثمانين.";
  const sql = await getSql();
  const open = await sql<Row>`select id from letters where user_id = ${userId} and reply is null limit 1`;
  if (open.length) return "رسالتك ما زالت عند الديوان.";
  await sql`insert into letters (user_id, body) values (${userId}, ${text})`;
  return null;
}

export async function loadDiwan(userId: string): Promise<DiwanBoard> {
  const sql = await getSql();
  const face = await status(sql, userId);
  if (!face.steward) return { ok: false, error: "closed" };
  await sql`update letters set seen = true where seen = false`;
  const tribes = await sql<Row>`
    select name, sheikh_name, lineage, x, y, water, food, gold, wood, stone,
           infantry, cavalry, renown, peace_until, saalik_pacts
    from tribes
    order by name
  `;
  const letters = await sql<Row>`
    select l.id, l.body, l.created_at, l.seen, l.reply, l.replied_at, t.name as tribe
    from letters l
    left join tribes t on t.user_id = l.user_id
    order by (l.reply is null) desc, l.id desc
    limit 40
  `;
  return {
    ok: true,
    tribes: tribes.map((row) => ({
      name: String(row.name),
      sheikh: String(row.sheikh_name || "شيخ"),
      lineage: String(row.lineage || ""),
      x: num(row.x),
      y: num(row.y),
      water: num(row.water),
      food: num(row.food),
      gold: num(row.gold),
      wood: num(row.wood),
      stone: num(row.stone),
      infantry: num(row.infantry),
      cavalry: num(row.cavalry),
      renown: num(row.renown),
      peace: epoch(row.peace_until) != null && (epoch(row.peace_until) ?? 0) > Date.now(),
      pacts: num(row.saalik_pacts),
    })),
    letters: letters.map((row) => ({
      id: num(row.id),
      tribe: row.tribe == null ? "قبل النصب" : String(row.tribe),
      body: String(row.body),
      createdAt: epoch(row.created_at) ?? Date.now(),
      seen: Boolean(row.seen),
      reply: row.reply == null ? null : String(row.reply),
      repliedAt: epoch(row.replied_at),
    })),
  };
}

export async function replyLetter(userId: string, id: number, body: string): Promise<string | null> {
  const text = clean(body, MAX_REPLY);
  if (!text) return "الرد حرفان إلى أربعمئة.";
  const sql = await getSql();
  const face = await status(sql, userId);
  if (!face.steward) return "ليس هذا ديوانك.";
  const rows = await sql<Row>`
    update letters
    set reply = ${text}, replied_at = now(), seen = true
    where id = ${id} and reply is null
    returning user_id
  `;
  const owner = rows[0]?.user_id;
  if (!owner) return "هذه الرسالة رُدّ عليها أو لم تُوجد.";
  const player = String(owner);
  await sql`
    insert into reports (user_id, kind, title, body, victory)
    values (${player}, 'diwan', 'رد الإدارة', ${`قال الديوان: ${text}`}, null)
  `;
  await sql`
    delete from reports
    where user_id = ${player}
      and id not in (
        select id from reports where user_id = ${player} order by id desc limit 40
      )
  `;
  return null;
}
