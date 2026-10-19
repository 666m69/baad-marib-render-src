/**
 * Brute-force limits for the email sign-in and sign-up endpoints, keyed by the
 * client IP from `client-ip.ts`. Stored in Postgres (table "rateLimit",
 * migration 0018), so the limit survives restarts and is shared by every
 * instance.
 */
export const AUTH_RATE_LIMIT = {
  enabled: true,
  storage: "database" as const,
  window: 60,
  max: 100,
  customRules: {
    "/sign-in/email": { window: 60, max: 5 },
    "/sign-up/email": { window: 3600, max: 5 },
  },
};
