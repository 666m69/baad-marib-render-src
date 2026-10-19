// @ts-check
/**
 * Migration bookkeeping shared by the two appliers: `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (local PGlite, `import.meta.glob`).
 * Applied files are keyed by BASENAME and never run twice. Neither applier
 * descends into subdirectories.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}

/**
 * The URL the migration runner connects to: Neon's direct (non-pooled)
 * endpoint when DATABASE_URL_UNPOOLED is set, since DDL and long transactions
 * do not belong on the pgbouncer pooler; otherwise DATABASE_URL. Only
 * scripts/migrate.mjs uses this; the app always uses the pooled DATABASE_URL.
 * @param {Record<string, string | undefined>} env
 * @returns {{ url: string, source: "DATABASE_URL_UNPOOLED" | "DATABASE_URL" } | null}
 */
export function migrationDatabaseUrl(env) {
  for (const source of /** @type {const} */ (["DATABASE_URL_UNPOOLED", "DATABASE_URL"])) {
    const url = env[source]?.trim();
    if (url) return { url, source };
  }
  return null;
}
