// @skill jgengine-world
/**
 * A scene's ground grown by the landform generator instead of sculpted: a document carries a `terrainGenerator`
 * (`{ generator: "landform", params: { start, seed } }`) and no `terrain`, and {@link withGeneratedTerrain} runs
 * {@link LANDFORM_GENERATOR} on those params on first load, growing the ground from geology, rivers, ice and wind.
 * `start` names one of `LANDFORM_SCHEMA`'s presets; any other param in `params` overrides it. Once the editor saves,
 * the grown terrain is the document's own sculpt, and the author reshapes it like any other.
 *
 * @capability landform-start start a scene on a glacial valley, dunes or a coast grown by the landform generator from a seed
 */
import type { EditorDocument } from "../../editor/types";
import { runGenerator } from "../../generator/generator";
import { LANDFORM_GENERATOR } from "./landformGenerator";
import { landformTerrainSnapshot } from "./landformTerrain";

/**
 * The document with its generated terrain grown in when it has a generator and no sculpt; otherwise unchanged. The
 * grown ground sits with its middle cell at height 0. Deterministic, and cached by the generator.
 * @capability landform-start start a scene on a glacial valley, dunes or a coast grown by the landform generator from a seed
 */
export function withGeneratedTerrain(doc: EditorDocument): EditorDocument {
  const generator = doc.terrainGenerator;
  if (doc.terrain !== undefined || generator === undefined) return doc;
  const terrain = runGenerator(LANDFORM_GENERATOR, generator.params);
  const middle = Math.floor(terrain.rows / 2) * terrain.cols + Math.floor(terrain.cols / 2);
  return { ...doc, terrain: landformTerrainSnapshot(terrain, { datum: terrain.heights[middle] ?? 0 }) };
}
