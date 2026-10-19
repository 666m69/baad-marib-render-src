#!/usr/bin/env node
/**
 * Production entry point (render.yaml startCommand). Checks the environment
 * BEFORE the server loads: with NODE_ENV=production and a missing DATABASE_URL,
 * BETTER_AUTH_SECRET or BETTER_AUTH_URL it logs why and exits 1. There is no
 * PGlite fallback and no default secret in production.
 *
 * SERVER_ENTRY overrides the built server (tests only).
 */
import { pathToFileURL } from "node:url";
import { isProductionEnv, productionEnvProblems } from "./env-check.mjs";

if (isProductionEnv(process.env)) {
  const problems = productionEnvProblems(process.env);
  if (problems.length) {
    console.error("[start] refusing to start in production:");
    for (const problem of problems) console.error(`[start]   - ${problem}`);
    console.error("[start] Set the missing values in the Render dashboard (see docs/deploy.md).");
    process.exit(1);
  }
}

const entry = process.env.SERVER_ENTRY || new URL("../.output/server/index.mjs", import.meta.url).href;
await import(entry.startsWith("file:") ? entry : pathToFileURL(entry).href);
