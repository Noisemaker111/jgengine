/**
 * Download every creature model in `src/game/data/creatureModels.ts` into
 * `public/models/imported/creatures/`, rigging the static ones with the engine's `autoRig`.
 * Animated models are made matte: their authors' metalness reads near black without a sky reflection
 * to mirror. Files already there are kept; `--force` re-bakes them, and names after the flags bake only those.
 *
 *   bun games/fernwild/scripts/bake-creatures.ts [--force] [file ...]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { autoRig } from "../src/engine-local/creatureBody/autoRig";
import { readGlbModel } from "../src/engine-local/creatureBody/glbRead";
import { encodeGlb } from "../src/engine-local/creatureBody/glbWrite";

import { readGlb, writeGlb } from "../../shared/compressTextures";
import { CREATURE_MODEL_SOURCES, type CreatureModelSource } from "../src/game/data/creatureModels";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "models", "imported", "creatures");
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((arg) => !arg.startsWith("--"));

/** The GLB with every material's metalness at 0; only the JSON changes, so compressed meshes pass through. */
function matte(bytes: Uint8Array): Uint8Array {
  const { json, bin } = readGlb(bytes);
  for (const material of json.materials ?? []) material.pbrMetallicRoughness = { ...(material.pbrMetallicRoughness as object | undefined), metallicFactor: 0 };
  return writeGlb(json, bin);
}

mkdirSync(out, { recursive: true });
for (const [file, source] of Object.entries(CREATURE_MODEL_SOURCES) as [string, CreatureModelSource][]) {
  if (only.length > 0 && !only.includes(file)) continue;
  const target = join(out, `${file}.glb`);
  if (existsSync(target) && !force) continue;
  const response = await fetch(`https://static.poly.pizza/${source.resource}.glb`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${file}: download failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const baked = source.rig === undefined ? matte(bytes) : encodeGlb(autoRig(readGlbModel(bytes), source.rig));
  writeFileSync(target, baked);
  console.log(`${file}.glb  ${(baked.byteLength / 1024).toFixed(0)} KB${source.rig === undefined ? "" : `  rigged as ${source.rig.shape}`}`);
}
