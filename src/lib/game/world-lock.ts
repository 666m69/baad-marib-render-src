import type { Sql } from "@/lib/db";

/**
 * Every write to the valley runs in one transaction that first takes this
 * Postgres advisory lock. It is held until commit or rollback and is shared by
 * every server instance on the same database, so ticks never run twice at once.
 */
export const WORLD_LOCK_KEY = 7106; // any constant; "مأرب"
export const WORLD_LOCK_SQL = `select pg_advisory_xact_lock(${WORLD_LOCK_KEY})`;

export type Begin = <R>(fn: (tx: Sql) => Promise<R>) => Promise<R>;

/** Run `fn` in one transaction that holds the valley lock until commit or rollback. */
export function inWorld<T>(begin: Begin, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return begin(async (tx) => {
    await tx.query(WORLD_LOCK_SQL);
    return fn(tx);
  });
}
