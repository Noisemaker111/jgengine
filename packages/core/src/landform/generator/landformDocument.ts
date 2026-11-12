// @skill jgengine-world
/**
 * The plain data a document stores to have its ground grown on first load: the landform generator's
 * id and the `meta` it grows from (`start` names one of the schema's presets, `seed` the seed).
 * `landformStart` grows it; this module stays light so document parsing need not load the models.
 *
 * @capability landform-start start a scene on a glacial valley, dunes or a coast grown by the landform generator from a seed
 */

/** The landform generator's registered id. */
export const LANDFORM_GENERATOR_ID = "landform";

/** A document's terrain generator: what grows its ground when it has no sculpt yet. */
export interface EditorTerrainGenerator {
  generator: typeof LANDFORM_GENERATOR_ID;
  /** The generator's `meta`: its params, an optional `start` preset and the `seed`. */
  params: Record<string, unknown>;
}

/**
 * Narrow an unknown value to a terrain generator.
 * @internal
 */
export function isEditorTerrainGenerator(value: unknown): value is EditorTerrainGenerator {
  if (typeof value !== "object" || value === null || !("generator" in value) || !("params" in value)) return false;
  return value.generator === LANDFORM_GENERATOR_ID && typeof value.params === "object" && value.params !== null && !Array.isArray(value.params);
}
