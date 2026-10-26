/**
 * Serve every asset pack a game references from the shared asset store (`games/shared/assetStore.ts`),
 * downloading into the store only what no checkout on this machine has pulled yet. A game's own
 * `bun run dev` does the same for that game on start (`viteProvisionAssets`).
 *
 *   bun run games:provision                     every game
 *   bun run games:provision ember-command       one game
 *   bun run games:provision --link-only         link what the store has, download nothing
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { assetStoreRoot } from "../shared/assetStore";
import { provisionGame } from "../shared/provisionAssets";

const root = join(import.meta.dir, "..");
const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const linkOnly = argv.includes("--link-only");
const only = argv.filter((arg) => !arg.startsWith("--"));
const games = readdirSync(root)
  .filter((name) => existsSync(join(root, name, "src")) && existsSync(join(root, name, "package.json")))
  .filter((name) => only.length === 0 || only.includes(name));
let failed = false;
const counts = { linked: 0, pulled: 0, absent: 0 };
for (const game of games) {
  const result = await provisionGame(join(root, game), { download: !linkOnly });
  counts.linked += result.linked.length;
  counts.pulled += result.pulled.length;
  counts.absent += result.absent.length;
  if (result.failed.length > 0) {
    failed = true;
    console.error(`${game}: could not provision ${result.failed.join(", ")}`);
  }
}
console.log(
  `games:provision: ${games.length} game(s), ${counts.linked} linked from ${assetStoreRoot(join(root, ".."))}, ${counts.pulled} downloaded` +
    (counts.absent > 0 ? `, ${counts.absent} not in the store yet (bun run games:provision pulls them)` : ""),
);
process.exit(failed ? 1 : 0);
