/**
 * GET /health for Render's health check (render.yaml healthCheckPath).
 * Runs `select 1`: 200 "ok", or 503 when the database fails or takes longer
 * than Render's 5 s window. It only touches the database: no world tick, no
 * session, so it does not count as player activity.
 */
import type { Sql } from "./db";

export const HEALTH_TIMEOUT_MS = 4000;

const plain = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function healthResponse(getSql: () => Promise<Sql>, timeoutMs = HEALTH_TIMEOUT_MS): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const check = (async () => {
      const sql = await getSql();
      const rows = await sql<{ ok: number }>`select 1 as ok`;
      if (Number(rows[0]?.ok) !== 1) throw new Error("unexpected select 1 result");
    })();
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer in ${timeoutMs} ms`)), timeoutMs);
    });
    await Promise.race([check, late]);
    return plain("ok", 200);
  } catch (err) {
    console.error("[health] database check failed:", err instanceof Error ? err.message : err);
    return plain("database unavailable", 503);
  } finally {
    clearTimeout(timer);
  }
}
