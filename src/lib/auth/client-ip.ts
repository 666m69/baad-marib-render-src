/**
 * The real client IP behind Render (QA N5 / S4).
 *
 * Render documents X-Forwarded-For as the header that carries the client IP
 * (https://render.com/articles/how-render-handles-ddos-attacks, "Reading the
 * true client IP"). Every proxy on the way only APPENDS to it, so the leftmost
 * entries are whatever the client typed and are never trusted. On Render the
 * chain ends with `<client>, <Cloudflare edge>, <Render load balancer>`: the
 * client is the entry TRUST_PROXY_HOPS = 3 from the right, and a forged
 * X-Forwarded-For only adds entries further left.
 *
 * CF-Connecting-IP is NOT read: Render does not document it, and a request that
 * reaches the app any other way could set it freely.
 *
 * The result goes into CLIENT_IP_HEADER, the only header Better Auth reads for
 * rate limiting. Any incoming copy of that header is dropped first.
 */
export const CLIENT_IP_HEADER = "x-baad-client-ip";

/** Proxies that append to X-Forwarded-For on Render: Cloudflare's edge, then Render's load balancer. */
export const RENDER_PROXY_HOPS = 3;

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

export function isIp(value: string) {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value) && value.length <= 45);
}

/**
 * How many X-Forwarded-For entries, counted from the right, our own proxies
 * wrote: TRUST_PROXY_HOPS when set, 3 on Render (RENDER=true, set by Render on
 * every service), otherwise 1 (local runs behind one proxy).
 */
export function proxyHops(env: Record<string, string | undefined> = process.env) {
  const set = Math.floor(Number(env.TRUST_PROXY_HOPS));
  if (Number.isFinite(set) && set >= 1) return set;
  return env.RENDER === "true" ? RENDER_PROXY_HOPS : 1;
}

/** The X-Forwarded-For entry `hops` from the right, or null (missing, too short, or not an IP). */
export function resolveClientIp(headers: Headers, hops = 1): string | null {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const n = Math.max(1, Math.floor(hops));
  if (chain.length < n) return null;
  const pick = chain[chain.length - n];
  return pick && isIp(pick) ? pick : null;
}

/**
 * A copy of `request` whose CLIENT_IP_HEADER is set by us, never by the client.
 * Built field by field: in production the incoming request is the server's own
 * Request-like object, which `new Request(request, init)` cannot clone.
 */
export async function withClientIp(request: Request, hops = 1): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = resolveClientIp(request.headers, hops);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  return new Request(request.url, { method, headers, body, redirect: request.redirect });
}
