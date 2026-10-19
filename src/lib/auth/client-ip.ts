/**
 * The real client IP behind Render. Render serves every service through
 * Cloudflare, which sets CF-Connecting-IP to the connecting client and replaces
 * any value the client sent. X-Forwarded-For is only APPENDED to by the
 * proxies, so its leftmost entry is whatever the client typed; we never trust
 * it. Without CF-Connecting-IP we take the entry the nearest trusted proxy
 * added (TRUST_PROXY_HOPS from the right, default 1).
 *
 * The result goes into CLIENT_IP_HEADER, the only header Better Auth reads for
 * rate limiting. Any incoming copy of that header is dropped first.
 */
export const CLIENT_IP_HEADER = "x-baad-client-ip";

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

export function isIp(value: string) {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value) && value.length <= 45);
}

export function resolveClientIp(headers: Headers, hops = 1): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf && isIp(cf)) return cf;
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const pick = chain[chain.length - Math.max(1, Math.floor(hops))];
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
