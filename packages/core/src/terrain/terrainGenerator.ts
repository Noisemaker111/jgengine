// @skill jgengine-world
/**
 * The plain data a document stores to have its ground grown on first load; `terrain/landformStart` grows it.
 *
 * @capability landform-start start a scene on a glacial valley, dunes or a coast grown by the landform generator from a seed
 */

/** The named landform starts `jgengine create --landform` offers. */
export const LANDFORM_STARTS = ["glacial-valley", "dunes", "coast"] as const;

/** One named landform start. */
export type LandformStart = (typeof LANDFORM_STARTS)[number];

/** A document's terrain generator: what grows its ground when it has no sculpt yet. */
export interface EditorTerrainGenerator {
  kind: "landform";
  start: LandformStart;
  seed: string;
}

/**
 * Narrow an unknown value to a terrain generator.
 * @internal
 */
export function isEditorTerrainGenerator(value: unknown): value is EditorTerrainGenerator {
  if (typeof value !== "object" || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  return record["kind"] === "landform" && typeof record["seed"] === "string" && LANDFORM_STARTS.some((start) => start === record["start"]);
}
