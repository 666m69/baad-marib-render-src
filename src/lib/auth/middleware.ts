import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions: rejects scripted cross-site requests,
 * then resolves the verified user id from the session cookie into
 * `context.userId`. Scope every per-player query by it.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // Only `*.server` modules here, so server code never reaches the browser bundle.
  const { assertSameSiteRequest } = await import("./isolation.server");
  const { requireUserId } = await import("./verify.server");
  assertSameSiteRequest();
  const userId = await requireUserId();
  return next({ context: { userId } });
});
