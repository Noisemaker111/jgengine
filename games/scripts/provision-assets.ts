/**
 * Pull every asset pack a game references into its `public/`, so a fresh clone (or CI) can run,
 * test and capture without hand-pulling packs. A game's own `bun run dev` does the same for that
 * game on start (`viteProvisionAssets`).
 *
 *   bun run games:provision                 every game
 *   bun run games:provision ember-command   one game
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { provisionGame } from "../shared/provisionAssets";

const root = join(import.meta.dir, "..");
const only = process.argv.slice(2);
const games = readdirSync(root)
  .filter((name) => existsSync(join(root, name, "src")) && existsSync(join(root, name, "package.json")))
  .filter((name) => only.length === 0 || only.includes(name));
let failed = false;
for (const game of games) {
  if ((await provisionGame(join(root, game))).length > 0) failed = true;
}
process.exit(failed ? 1 : 0);
