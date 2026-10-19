/**
 * Fails (exit 1) when any tribe / sheikh / NPC name the game ships, in code
 * seed data or in a migration, is refused by the player-name blocklist.
 * Run: npm run check:names (also part of npm test).
 */
import { fileURLToPath } from "node:url";
import { seedNameHits, seedNames } from "../src/lib/game/seed-names";

const names = seedNames(fileURLToPath(new URL("../migrations", import.meta.url)));
const hits = seedNameHits(names);
if (hits.length) {
  console.error(`[check-seed-names] ${hits.length} shipped name(s) are on the blocklist:`);
  for (const hit of hits) console.error(`[check-seed-names]   «${hit.name}» in ${hit.source}`);
  process.exit(1);
}
console.log(`[check-seed-names] ${names.length} shipped names checked, none blocked.`);
