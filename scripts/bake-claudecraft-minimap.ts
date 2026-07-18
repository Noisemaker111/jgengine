/**
 * One-off deterministic bake of claudecraft's minimap (#1036). Reconstructs the game's base ground
 * field exactly as its runtime does (`groundFieldFor(world)`), composes it with the authored scene
 * document, rasterizes a top-down PNG with the pure core bake, and writes `{ background, bounds }`
 * into `Games/claudecraft/src/editor.scene.json` under a `minimap` key — so the committed scene
 * carries the baked terrain and claudecraft's minimap renders authored terrain at runtime.
 *
 * Run: `bun run scripts/bake-claudecraft-minimap.ts`
 * Deterministic (seeded terrain, no Date/Math.random in the bake path) — safe to re-run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Import the built core directly (this script lives in scripts/, which has no @jgengine symlink; the
// dist path resolves to the same files the workspace symlinks target, so it shares one module instance
// with claudecraft's own world.ts imports below).
import { bakeMinimapFromDocument, normalizeEditorLayers, type EditorLayersInput } from "../packages/core/dist/editor/index.js";
import { groundFieldFor } from "../packages/core/dist/world/terrain.js";

import { world } from "../Games/claudecraft/src/world";

const RESOLUTION = 160;

const scenePath = fileURLToPath(new URL("../Games/claudecraft/src/editor.scene.json", import.meta.url));
const raw = JSON.parse(readFileSync(scenePath, "utf8")) as Record<string, unknown>;

const doc = normalizeEditorLayers(raw as unknown as EditorLayersInput);
const ground = groundFieldFor(world);

const { background, mapBounds } = bakeMinimapFromDocument(doc, (x, z) => ground.sampleHeight(x, z), {
  resolution: RESOLUTION,
  sampleNormal: (x, z) => ground.sampleNormal(x, z),
  ...(ground.waterLevel === undefined ? {} : { waterLevel: ground.waterLevel }),
});

raw.minimap = { background, bounds: mapBounds };
writeFileSync(scenePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

const b64 = background.slice(background.indexOf(",") + 1);
console.log(
  `Baked claudecraft minimap: ${Math.floor((b64.length * 3) / 4)} bytes PNG at resolution ${RESOLUTION}, bounds`,
  mapBounds,
);
