/**
 * Encode GPU-compressed KTX2 twins of every game's textures into the shared asset store
 * (`games/shared/compressTextures.ts`). Servers hand a twin out in place of the original once it
 * exists, so this only ever makes loads lighter; it never changes a file a game commits.
 *
 *   bun run games:compress                 every game
 *   bun run games:compress saltwick        one game
 *
 * It runs at idle priority, skips in CI (`JG_DEV_PROVISION=1` overrides), and a run with nothing
 * left to encode costs one pass of hashing.
 */
import { existsSync, readdirSync } from "node:fs";
import { setPriority } from "node:os";
import { join } from "node:path";

import { assetStoreRoot } from "../../packages/assets/src/assetStore";
import { compressTextures } from "../shared/compressTextures";
import { shouldProvision } from "../shared/provisionAssets";
import { textureVariantDir } from "../shared/textureVariants";

if (!shouldProvision(process.env)) {
  console.log("games:compress: skipped in CI (JG_DEV_PROVISION=1 runs it)");
  process.exit(0);
}
try {
  setPriority(19);
} catch {
  // A platform without priorities still encodes, just not politely.
}

const root = join(import.meta.dir, "..");
const only = process.argv.slice(2).filter((arg) => arg !== "--" && !arg.startsWith("--"));
const publicDirs = readdirSync(root)
  .filter((name) => existsSync(join(root, name, "src")) && existsSync(join(root, name, "public")))
  .filter((name) => only.length === 0 || only.includes(name))
  .map((name) => join(root, name, "public"));
// The dev runner's own public/ carries copies of packs a game links, served ahead of the game's.
if (only.length === 0) publicDirs.push(join(root, "..", "apps", "dev", "public"));
await compressTextures(publicDirs, textureVariantDir(assetStoreRoot(join(root, ".."))));
process.exit(0);
