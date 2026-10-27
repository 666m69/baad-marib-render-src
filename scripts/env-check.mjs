/**
 * Production start-up requirements, shared by scripts/start.mjs and src/lib/db.ts.
 * Pure: takes an env object, returns the list of problems (empty = fine).
 */

/**
 * Production means NODE_ENV=production (Render sets it in render.yaml).
 * @param {Record<string, string | undefined>} env
 */
export function isProductionEnv(env) {
  return String(env.NODE_ENV ?? "").trim() === "production";
}

/**
 * Why a production server must not start. Never echoes secret values.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function productionEnvProblems(env) {
  /** @param {string} key */
  const value = (key) => String(env[key] ?? "").trim();
  /** @type {string[]} */
  const problems = [];
  if (!value("DATABASE_URL")) problems.push("DATABASE_URL is missing (production never falls back to PGlite).");
  const secret = value("BETTER_AUTH_SECRET");
  if (!secret) problems.push("BETTER_AUTH_SECRET is missing.");
  else if (secret.length < 32) problems.push("BETTER_AUTH_SECRET must be at least 32 characters.");
  const url = value("BETTER_AUTH_URL");
  if (!url) problems.push("BETTER_AUTH_URL is missing.");
  else if (!/^https:\/\//.test(url)) problems.push("BETTER_AUTH_URL must be https.");
  return problems;
}
