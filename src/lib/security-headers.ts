/**
 * Response headers for every route (Nitro routeRules in vite.config.ts).
 * The CSP is deliberately narrow: it forbids framing, plugins, foreign <base>
 * and foreign form targets, without touching scripts (TanStack Start hydrates
 * with inline scripts).
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
