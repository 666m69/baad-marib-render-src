/**
 * Better Auth for «بعد مأرب» (server-only): email + password, sessions stored
 * in the game's own Postgres (PGlite locally). No third-party sign-in.
 *
 * Settings come from `config.ts`: production refuses to start without
 * BETTER_AUTH_SECRET and BETTER_AUTH_URL. Client IPs for rate limiting come
 * from `client-ip.ts` (set by `/api/auth/$`).
 *
 * NEVER import this from client code.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { CLIENT_IP_HEADER } from "./client-ip";
import { authSettings } from "./config";
import { pgliteDialect } from "./pglite-dialect";
import { AUTH_RATE_LIMIT } from "./rate-limit";

void ensureDbReady();

/** Local-only signing secret, stable across dev reloads. Never used in production (config.ts throws). */
const devRef = globalThis as typeof globalThis & { __baadMaribDevSecret__?: string };
const devSecret = () => (devRef.__baadMaribDevSecret__ ??= randomBytes(32).toString("hex"));

const settings = authSettings(process.env, devSecret);
const databaseUrl = process.env.DATABASE_URL?.trim();

const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 3, idleTimeoutMillis: 10_000 })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

export const SESSION_TOKEN_COOKIE = "__Host-baad-marib.session_token";

export const auth = betterAuth({
  appName: "بعد مأرب",
  baseURL: settings.baseURL,
  secret: settings.secret,
  database,
  trustedOrigins: settings.trustedOrigins,
  emailAndPassword: { enabled: true },
  // Email is not verified yet (P2). The steward check in steward.ts requires
  // emailVerified = true, which DevOps sets by hand for the owner.
  account: { accountLinking: { enabled: false } },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  rateLimit: AUTH_RATE_LIMIT,
  advanced: {
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    // `__Host-` cookies: Secure, Path=/, no Domain, so no sibling host can set them.
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-baad-marib.session_data" },
      dont_remember: { name: "__Host-baad-marib.dont_remember" },
    },
  },
  // Must stay last: bridges Set-Cookie into TanStack Start responses.
  plugins: [tanstackStartCookies()],
});
