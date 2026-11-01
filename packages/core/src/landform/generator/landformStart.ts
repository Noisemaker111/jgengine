// @skill jgengine-world
/**
 * A scene's ground grown by the landform generator instead of sculpted: a document carries a `terrainGenerator`
 * (`{ kind: "landform", start, seed }`) and no `terrain`, and {@link withGeneratedTerrain} grows the terrain on first
 * load from geology, rivers, ice and wind ({@link growLandform}). Once the editor saves, the grown terrain is the
 * document's own sculpt, and the author reshapes it like any other.
 *
 * @capability landform-start start a scene on a glacial valley, dunes or a coast grown by the landform generator from a seed
 */
import type { EditorDocument } from "../../editor/types";
import { parseParams } from "../../generator/paramSchema";
import { LANDFORM_SCHEMA, landformRecipe, type LandformGeneratorParams } from "./landformGenerator";
import { growLandform, landformTerrainSnapshot } from "./landformTerrain";
import type { TerraformSnapshot } from "../../terrain/terraform";
import type { LandformStart } from "../../terrain/terrainGenerator";

/**
 * Each start's generator params, about a 960 m map: a range cut by rivers then worked by ice above its snowline, a sand
 * sea under one wind, and a river-cut range drowned to a coast. Simulated at full scale and shrunk to the map.
 */
export const LANDFORM_START_PARAMS: Readonly<Record<LandformStart, Partial<LandformGeneratorParams>>> = {
  "glacial-valley": { side: 64, cellSize: 150, years: 1e6, uplift: 1, glacierEla: 600, scale: 0.1 },
  dunes: { side: 96, cellSize: 10, years: 1e4, uplift: 0, sand: 6, windToward: 70, windSpread: 0, duneSweeps: 300 },
  coast: { side: 96, cellSize: 100, years: 1e6, uplift: 1, seaLevel: 150, scale: 0.1 },
};

const grown = new Map<string, TerraformSnapshot>();

/**
 * The terrain a start grows from a seed, origin at ground level 0. Deterministic and cached.
 * @capability landform-start start a scene on a glacial valley, dunes or a coast grown by the landform generator from a seed
 */
export function landformStartTerrain(start: LandformStart, seed: string): TerraformSnapshot {
  const key = `${start}|${seed}`;
  const cached = grown.get(key);
  if (cached !== undefined) return cached;
  const params = parseParams(LANDFORM_SCHEMA, { ...LANDFORM_START_PARAMS[start], seed });
  const terrain = growLandform(landformRecipe(params), seed);
  const middle = Math.floor(terrain.rows / 2) * terrain.cols + Math.floor(terrain.cols / 2);
  const snapshot = landformTerrainSnapshot(terrain, { datum: terrain.heights[middle] ?? 0 });
  grown.set(key, snapshot);
  return snapshot;
}

/**
 * The document with its generated terrain grown in when it has a generator and no sculpt; otherwise unchanged.
 * @capability landform-start start a scene on a glacial valley, dunes or a coast grown by the landform generator from a seed
 */
export function withGeneratedTerrain(doc: EditorDocument): EditorDocument {
  const generator = doc.terrainGenerator;
  if (doc.terrain !== undefined || generator === undefined) return doc;
  return { ...doc, terrain: landformStartTerrain(generator.start, generator.seed) };
}
