/**
 * The game ships without the hosting template it was born in: no committed
 * OAuth secret, no injected third-party script, no platform hooks.
 * (The old secret stays in git history by decision; it was the template's
 * shared preview client, never this game's, and nothing reads it now.)
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const SELF = "src/lib/game/clean-repo.test.ts";
const NAME_LIST = ["src/lib/game/names.ts", "src/lib/game/names.test.ts"];

function tracked(): string[] {
  const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  return out.split("\n").filter((f) => f && f !== SELF && f !== "package-lock.json");
}

const FORBIDDEN: Array<[string, RegExp]> = [
  ["preview OAuth secret", /8bcd[0-9a-f]{8,}|PREVIEW_CLIENT_SECRET|GROK_AUTH_CLIENT_SECRET/],
  ["preview client id", /grok_preview/],
  ["injected extensions.js", /extensions\.js/],
  ["platform hosts", /grok-sandbox|auth\.grok\.me|grok\.com|\.grok\.me/],
  ["platform assets", /__grok|grok-pwa/],
  ["platform env", /GROK_[A-Z_]+|VITE_AUTH_ENABLED|isWorkspacePreview/],
  ["any other mention", /\bgrok\b/i],
];

test("no Grok platform leftovers in any tracked file", () => {
  const hits: string[] = [];
  for (const file of tracked()) {
    if (/\.(png|jpe?g|webp|ico|woff2?)$/.test(file)) continue;
    let text: string;
    try {
      text = readFileSync(root + file, "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    for (const [label, re] of FORBIDDEN) {
      // The name blocklist must spell the word it bans.
      if (label === "any other mention" && NAME_LIST.includes(file)) continue;
      if (re.test(text)) hits.push(`${file}: ${label}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("no platform files or folders remain", () => {
  const bad = tracked().filter((f) =>
    /^(public\/__grok|server\/|AGENTS|HANDOFF|startup\.sh|vercel\.json|screenshots\/app-builder|src\/lib\/(app-data|multiplayer)\/|src\/lib\/preview-|src\/lib\/auth\/(preview|popup|gate-))/.test(f),
  );
  assert.deepEqual(bad, []);
});

test("nitro is pinned to one exact version, and the lockfile agrees", () => {
  const pkg = JSON.parse(readFileSync(root + "package.json", "utf8"));
  const lock = JSON.parse(readFileSync(root + "package-lock.json", "utf8"));
  const want = pkg.dependencies.nitro as string;
  assert.match(want, /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/, `nitro must be exact, got "${want}"`);
  assert.equal(lock.packages[""].dependencies.nitro, want);
  assert.equal(lock.packages["node_modules/nitro"].version, want);
  assert.match(readFileSync(root + ".npmrc", "utf8"), /save-exact=true/);
});
