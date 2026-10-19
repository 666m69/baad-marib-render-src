/**
 * Auth settings from the environment. Pure, so it can be tested.
 *
 * Production (NODE_ENV=production, or any real DATABASE_URL) REQUIRES
 * BETTER_AUTH_SECRET (32+ chars) and BETTER_AUTH_URL. There is no built-in
 * fallback secret: a missing value stops the server instead of signing sessions
 * with something guessable or shared.
 */
export type AuthEnv = Record<string, string | undefined>;

export const LOCAL_DEV_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"];

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

function read(env: AuthEnv, key: string) {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function isProduction(env: AuthEnv) {
  return read(env, "NODE_ENV") === "production" || Boolean(read(env, "DATABASE_URL"));
}

export function authSettings(env: AuthEnv, devSecret: () => string) {
  const production = isProduction(env);
  const secret = read(env, "BETTER_AUTH_SECRET");
  const url = read(env, "BETTER_AUTH_URL")?.replace(/\/+$/, "");
  if (production) {
    if (!secret || secret.length < 32) throw new AuthConfigError("BETTER_AUTH_SECRET (32+ characters) is required in production.");
    if (!url) throw new AuthConfigError("BETTER_AUTH_URL (the public https URL) is required in production.");
    if (!/^https:\/\//.test(url)) throw new AuthConfigError("BETTER_AUTH_URL must be https in production.");
  }
  return {
    production,
    secret: secret ?? devSecret(),
    baseURL: url ?? LOCAL_DEV_ORIGINS[0],
    trustedOrigins: production ? [url as string] : [...(url ? [url] : []), ...LOCAL_DEV_ORIGINS],
  };
}
