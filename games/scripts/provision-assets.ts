/**
 * Serve every asset pack a game references from the shared asset store (`packages/assets/src/assetStore.ts`),
 * downloading into the store only what no checkout on this machine has pulled yet. A game's own
 * `bun run dev` does the same for that game on start (`viteProvisionAssets`).
 *
 *   bun run games:provision                     every game
 *   bun run games:provision ember-command       one game
 *   bun run games:provision --link-only         link what the store has, download nothing
 *   bun run games:provision fernwild --library gameicons:lorc/wheat   serve one library key; prints { url }
 *
 *   bun run games:provision build harbor-heat   the asset pipeline: provision, KTX2 texture twins, the
 *                                               simplified levels and baked impostors its jgengine.json
 *                                               `assetBuild` names (`games/shared/buildGameAssets.ts`);
 *                                               cached by content, at most 4 workers at idle priority
 *     --no-impostors   skip the headless-browser bake      --textures-only   only the texture twins
 */
import { existsSync, readdirSync } from "node:fs";
import { setPriority } from "node:os";
import { join } from "node:path";

import { assetStoreRoot } from "../../packages/assets/src/assetStore";
import { buildGameAssets } from "../shared/buildGameAssets";
import { provisionGame, provisionLibraryKey, shouldProvision } from "../shared/provisionAssets";

const root = join(import.meta.dir, "..");
const argv = process.argv.slice(2).filter((arg) => arg !== "--");
if (argv[0] === "build") {
  if (!shouldProvision(process.env)) {
    console.log("games:provision build: skipped in CI (JG_DEV_PROVISION=1 runs it)");
    process.exit(0);
  }
  try {
    setPriority(19);
  } catch {
    // A platform without priorities still builds, just not politely.
  }
  const rest = argv.slice(1);
  const texturesOnly = rest.includes("--textures-only");
  const named = rest.filter((arg) => !arg.startsWith("--"));
  const targets = readdirSync(root)
    .filter((name) => existsSync(join(root, name, "src")) && existsSync(join(root, name, "package.json")))
    .filter((name) => named.length === 0 || named.includes(name));
  let broken = false;
  for (const game of targets) {
    const gameDir = join(root, game);
    const provisioned = await provisionGame(gameDir, { download: true });
    if (provisioned.failed.length > 0) console.error(`${game}: could not provision ${provisioned.failed.join(", ")}`);
    const summary = await buildGameAssets(gameDir, {
      log: (line) => console.log(`${game}: ${line}`),
      lods: !texturesOnly,
      impostors: !texturesOnly && !rest.includes("--no-impostors"),
    });
    broken ||= summary.failed.length > 0 || provisioned.failed.length > 0;
  }
  process.exit(broken ? 1 : 0);
}
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
