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

/** The name blocklist and its tests list sacred names in order to refuse them; they are not content. */
const BLOCKLIST = [join(ROOT, "src", "lib", "game", "names.ts"), join(ROOT, "src", "lib", "game", "names.test.ts")];

const gameFiles = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "migrations")), ...walk(join(ROOT, "public"))].filter(
  (file) => file !== SCRUB && !BLOCKLIST.includes(file),
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

test("no lone «لبيد» among sheikh names, and no lineage edge hints at a sanctuary (QA #18, #19)", () => {
  assert.equal(SHEIKH_NAMES.includes("لبيد"), false);
  const balance = readFileSync(join(ROOT, "src/lib/game/balance.ts"), "utf8");
  const engine = readFileSync(join(ROOT, "src/lib/game/engine.server.ts"), "utf8");
  assert.doesNotMatch(balance + engine, /sacred|دنّس/);
  assert.equal(LINEAGE.khuzaa.edge, "haven");
});

test("tribe names after a preposition take the genitive: «نصر على بني …» (QA #17)", async () => {
  const { genitive } = await import("./names");
  assert.equal(`نصر على ${genitive("بنو السراب")}`, "نصر على بني السراب");
  assert.equal(genitive("أبو الحسن"), "أبي الحسن");
  assert.equal(genitive("ذو يزن"), "ذي يزن");
  assert.equal(genitive("كندة"), "كندة");
  assert.equal(genitive("بنوالسراب"), "بنوالسراب");
  const engine = readFileSync(join(ROOT, "src/lib/game/engine.server.ts"), "utf8");
  assert.doesNotMatch(engine, /(على|أمام|من|مع) \$\{(label|defName|publicName|attackerName|String\(tribe\.name\))\}/);
});
