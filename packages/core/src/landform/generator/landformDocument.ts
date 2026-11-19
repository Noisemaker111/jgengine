// @skill jgengine-world
/** @capability landform-start start a scene on a glacial valley, dunes or a coast grown by the landform generator from a seed */

export const LANDFORM_GENERATOR_ID = "landform";

export interface EditorTerrainGenerator {
  generator: typeof LANDFORM_GENERATOR_ID;
  params: Record<string, unknown>;
}

/** @internal */
export function isEditorTerrainGenerator(value: unknown): value is EditorTerrainGenerator {
  if (typeof value !== "object" || value === null || !("generator" in value) || !("params" in value)) return false;
  return value.generator === LANDFORM_GENERATOR_ID && typeof value.params === "object" && value.params !== null && !Array.isArray(value.params);
}
