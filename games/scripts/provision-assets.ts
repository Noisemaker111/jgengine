/**
 * Serve every asset pack a game references from the shared asset store (`packages/assets/src/assetStore.ts`),
 * downloading into the store only what no checkout on this machine has pulled yet. A game's own
 * `bun run dev` does the same for that game on start (`viteProvisionAssets`).
 *
 *   bun run games:provision                     every game
 *   bun run games:provision ember-command       one game
 *   bun run games:provision --link-only         link what the store has, download nothing
 *   bun run games:provision fernwild --library gameicons:lorc/wheat   serve one library key; prints { url }
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { assetStoreRoot } from "../../packages/assets/src/assetStore";
import { provisionGame, provisionLibraryKey } from "../shared/provisionAssets";

const root = join(import.meta.dir, "..");
const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const linkOnly = argv.includes("--link-only");
const libraryIndex = argv.indexOf("--library");
if (libraryIndex >= 0) {
  const key = argv[libraryIndex + 1];
  const game = argv.find((arg, index) => !arg.startsWith("--") && index !== libraryIndex + 1);
  if (key === undefined || game === undefined) {
    console.error("usage: games:provision <game> --library <source>:<id>");
    process.exit(1);
  }
  const served = await provisionLibraryKey(join(root, game), key, { log: (line) => console.error(line) });
  if (served === null) {
    console.error(`games:provision: could not serve ${key} in ${game}`);
    process.exit(1);
  }
  console.log(JSON.stringify(served));
  process.exit(0);
}
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
