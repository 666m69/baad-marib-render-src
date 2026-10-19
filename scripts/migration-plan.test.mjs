import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isMigrationFile, migrationName, pendingMigrations } from "./migration-plan.mjs";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("an applied file does not re-apply", () => {
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("migration numbers are unique and start with the auth schema", () => {
  const files = readdirSync(migrationsDir).filter(isMigrationFile).sort();
  assert.equal(files[0], "0001_auth.sql");
  const numbers = files.map((f) => f.slice(0, 4));
  assert.equal(new Set(numbers).size, numbers.length, files.join(", "));
});

test("migrations use the unpooled URL when it is set, and DATABASE_URL otherwise", async () => {
  const { migrationDatabaseUrl } = await import("./migration-plan.mjs");
  assert.deepEqual(migrationDatabaseUrl({ DATABASE_URL: "postgres://pooled", DATABASE_URL_UNPOOLED: "postgres://direct" }), {
    url: "postgres://direct",
    source: "DATABASE_URL_UNPOOLED",
  });
  assert.deepEqual(migrationDatabaseUrl({ DATABASE_URL: "postgres://pooled", DATABASE_URL_UNPOOLED: "  " }), {
    url: "postgres://pooled",
    source: "DATABASE_URL",
  });
  assert.equal(migrationDatabaseUrl({}), null);
});

test("only the migration runner reads DATABASE_URL_UNPOOLED; it is documented as a dashboard secret", async () => {
  const { readFileSync } = await import("node:fs");
  const root = join(migrationsDir, "..");
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const readers = walk(join(root, "src")).filter((f) => readFileSync(f, "utf8").includes("DATABASE_URL_UNPOOLED"));
  assert.deepEqual(readers, [], "the app must stay on the pooled DATABASE_URL");
  assert.match(readFileSync(join(root, "scripts", "migrate.mjs"), "utf8"), /migrationDatabaseUrl\(process\.env\)/);
  assert.match(readFileSync(join(root, ".env.example"), "utf8"), /^DATABASE_URL_UNPOOLED=$/m);
  assert.match(readFileSync(join(root, "render.yaml"), "utf8"), /- key: DATABASE_URL_UNPOOLED\n\s+sync: false/);
});

test("render.yaml turns preview environments off and sets no service PR previews", async () => {
  const { readFileSync } = await import("node:fs");
  const yaml = readFileSync(join(migrationsDir, "..", "render.yaml"), "utf8");
  assert.match(yaml, /^previews:\n {2}generation: "off"/m);
  assert.equal((yaml.match(/^[ \t]+previews:/gm) ?? []).length, 0, "per-service previews must stay omitted (= disabled)");
  assert.doesNotMatch(yaml, /pullRequestPreviewsEnabled: true|previewsEnabled: true/);
});
