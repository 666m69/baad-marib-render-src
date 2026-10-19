/**
 * GET /health for Render's health check (render.yaml healthCheckPath).
 * Runs `select 1`: 200 "ok", or 503 when the database fails or takes longer
 * than Render's 5 s window. It only touches the database: no world tick, no
 * session, so it does not count as player activity.
 *
 * Rate limit (QA N6): HEALTH_LIMIT requests per window per client IP, then 429
 * without touching the database. The IP comes from client-ip.ts (Render's
 * X-Forwarded-For, read from the right). Render's own health checker calls the
 * instance directly, without the Cloudflare / load-balancer hops, so it has no
 * client IP and is never limited; public callers always do.
 */
import { proxyHops, resolveClientIp } from "./auth/client-ip";
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

export const HEALTH_LIMIT = { max: 20, windowMs: 60_000 };

/** Fixed-window counter per IP, in memory (per instance). Returns true when the call may go on. */
export function healthLimiter(max = HEALTH_LIMIT.max, windowMs = HEALTH_LIMIT.windowMs, now: () => number = Date.now) {
  const hits = new Map<string, { start: number; n: number }>();
  return (ip: string | null) => {
    if (!ip) return true; // Render's internal checker (and local runs): never limited
    const t = now();
    if (hits.size > 10_000) for (const [key, hit] of hits) if (t - hit.start >= windowMs) hits.delete(key);
    const hit = hits.get(ip);
    if (!hit || t - hit.start >= windowMs) {
      hits.set(ip, { start: t, n: 1 });
      return true;
    }
    hit.n += 1;
    return hit.n <= max;
  };
}

const defaultLimiter = healthLimiter();

/** GET /health with the per-IP limit in front of the database check. */
export async function healthGate(
  request: Request,
  getSql: () => Promise<Sql>,
  allow: (ip: string | null) => boolean = defaultLimiter,
  hops = proxyHops(),
): Promise<Response> {
  if (!allow(resolveClientIp(request.headers, hops))) {
    const res = plain("too many requests", 429);
    res.headers.set("retry-after", String(Math.ceil(HEALTH_LIMIT.windowMs / 1000)));
    return res;
  }
  return healthResponse(getSql);
}
