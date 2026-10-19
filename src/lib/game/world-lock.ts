import type { Sql } from "@/lib/db";

/** Every write to the valley takes this row lock first, so ticks never run twice at once on any instance. */
export const WORLD_ROW_SQL = "insert into world_meta (id) values (1) on conflict (id) do nothing";
export const WORLD_LOCK_SQL = "select id from world_meta where id = 1 for update";

export type Begin = <R>(fn: (tx: Sql) => Promise<R>) => Promise<R>;

/** Run `fn` in one transaction that holds the valley lock until commit or rollback. */
export function inWorld<T>(begin: Begin, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return begin(async (tx) => {
    await tx.query(WORLD_ROW_SQL);
    await tx.query(WORLD_LOCK_SQL);
    return fn(tx);
  });
}
