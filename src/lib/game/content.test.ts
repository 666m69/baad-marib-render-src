import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LINEAGE, LINEAGES, SHEIKH_NAMES, poetLine } from "./balance";

const ROOT = new URL("../../../", import.meta.url).pathname;

/** Companions of the Prophet ﷺ who are known poets. None may appear as a character. */
const COMPANIONS = [
  "حسان بن ثابت",
  "كعب بن مالك",
  "عبد الله بن رواحة",
  "كعب بن زهير",
  "لبيد بن ربيعة",
  "الخنساء",
  "النابغة الجعدي",
  "العباس بن مرداس",
];

/** Whole-word match for Arabic: no letter right before (after an optional و/ف/ب/ل/ك proclitic) or after. */
function word(term: string) {
  return new RegExp(`(?<!\\p{L})(?:[وفبلك]{0,2})${term}(?!\\p{L})`, "u");
}

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|sql|html|json|md)$/.test(name) && !name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

/** The one migration that rewrites old stored reports may name the two Companions, only inside replace(). */
const SCRUB = join(ROOT, "migrations", "0017_scrub_companions.sql");

const gameFiles = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "migrations")), ...walk(join(ROOT, "public"))].filter(
  (file) => file !== SCRUB,
);

test("no Companion appears anywhere in game code or content", () => {
  for (const file of gameFiles) {
    const text = readFileSync(file, "utf8");
    for (const name of COMPANIONS) assert.ok(!word(name).test(text), `${name} in ${file}`);
  }
});

test("the whole-word matcher has no false alarms on look-alike words", () => {
  assert.ok(!word("الحرم").test("الحرمان من الماء"));
  assert.ok(word("الحرم").test("سدنة الحرم، وحمى"));
  assert.ok(word("الحرم").test("وبالحرم"));
  assert.ok(!word("حسان بن ثابت").test("إحسان بن ثابتة"));
  assert.ok(word("كعب بن مالك").test("شاعرها كعب بن مالك."));
});

test("every lineage poet is a documented jahili poet or a clearly fictional character", () => {
  for (const id of LINEAGES) {
    const line = LINEAGE[id];
    assert.ok(line.poetKind === "jahili" || line.poetKind === "fictional", id);
    for (const name of COMPANIONS) assert.ok(!line.poet.includes(name), `${id}: ${line.poet}`);
    if (line.poetKind === "fictional") assert.match(poetLine(line), /متخيَّلة/);
    assert.ok(line.poetNote.length > 0, id);
  }
  assert.equal(LINEAGE.aws.poet, "أحيحة بن الجلاح");
  assert.equal(LINEAGE.khuzaa.poetKind, "fictional");
  assert.equal(LINEAGE.azd.poetKind, "fictional");
});

test("sheikh name pool has no Companion's full name", () => {
  for (const name of SHEIKH_NAMES) for (const c of COMPANIONS) assert.notEqual(name, c);
});

test("Mecca is never a capture objective or win condition", () => {
  const forbidden = [word("مكة"), word("مكّة"), word("الكعبة"), word("الحرم"), word("البيت الحرام"), /\bmecca\b/i, /\bmakkah\b/i, /\bkaaba\b/i];
  for (const file of gameFiles) {
    const text = readFileSync(file, "utf8");
    for (const word of forbidden) assert.ok(!word.test(text), `${word} in ${file}`);
  }
});

test("the scrub migration names the Companions only to replace them", () => {
  const text = readFileSync(SCRUB, "utf8");
  const code = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  for (const name of ["حسان بن ثابت", "كعب بن مالك"]) {
    const uses = code.split(name).length - 1;
    const replaced = (code.match(new RegExp(`replace\\([^;]*'${name}'`, "g")) ?? []).length;
    assert.ok(uses > 0 && replaced > 0, name);
  }
  for (const name of COMPANIONS.slice(2)) assert.ok(!text.includes(name), name);
});
