/**
 * The generator-asset seam: register a parametric asset generator (`generate(params, seed) → parts`)
 * so a slider-driven prop (a bookcase with width/shelves/book-density, a building with floors/bays)
 * lives in the catalog alongside static GLBs. A placed instance stores only `{ assetId, params, seed }`
 * — the geometry is re-resolved at runtime, never baked. Schema drives the inspector via #809. The
 * generic seam is engine; concrete generators (building, bookcase) are adopters registered from
 * game/example code — the building generator is the one engine adopter, as a proof it composes.
 *
 * @capability asset-generator seeded parametric geometry registered as a placeable asset
 */
import { parseParams, type ParamSchema, type ParsedParams } from "./sceneKinds";

/** One generated primitive part — a box/panel placed in the asset's local space. */
export interface GeneratedPart {
  id: string;
  /** Optional semantic tag (shelf, board, book, wall, window …) for materials/inspection. */
  kind?: string;
  /** Local-space center. */
  position: readonly [number, number, number];
  /** Full box dimensions (w, h, d) in meters. */
  size: readonly [number, number, number];
  rotationY?: number;
  /** Hex color; the renderer falls back to a neutral material when absent. */
  color?: string;
}

/** A resolved generator asset: its parts plus the overall local-space bounds (min/max corners). */
export interface GeneratedAsset {
  parts: GeneratedPart[];
  bounds: { min: readonly [number, number, number]; max: readonly [number, number, number] };
  /**
   * The declared local-space direction the asset's "front" faces (a bookcase's open/book face, a
   * building's entrance) — so a camera rig or placement tool can orient it without hand-tuned
   * `rotationY`. Omit to use the convention default, +Z (`DEFAULT_FORWARD` in `./facing`); every
   * generator should build its front toward +Z unless it declares otherwise.
   */
  forward?: readonly [number, number, number];
}

/** A registered asset generator — schema drives the inspector; `generate` is a pure seeded function. */
export interface AssetGeneratorDefinition {
  id: string;
  label: string;
  schema: ParamSchema;
  /** Deterministic geometry from validated params + a seed string. Same inputs → same parts. */
  generate: (params: ParsedParams, seed: string) => GeneratedAsset;
}

const generators = new Map<string, AssetGeneratorDefinition>();

/** Register a parametric asset generator. Idempotent per id (last wins); call at module load. */
export function registerAssetGenerator(definition: AssetGeneratorDefinition): void {
  generators.set(definition.id, definition);
}

/** The registered generator for an id, or undefined. @internal */
export function getAssetGenerator(id: string): AssetGeneratorDefinition | undefined {
  return generators.get(id);
}

/** Every registered generator, in registration order. @internal */
export function listAssetGenerators(): AssetGeneratorDefinition[] {
  return [...generators.values()];
}

/**
 * Compute bounds from parts (each part is an axis-aligned box at its center) — a helper generators
 * return so callers can frame/ground the asset without re-deriving it.
 */
export function partsBounds(parts: readonly GeneratedPart[]): GeneratedAsset["bounds"] {
  if (parts.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const part of parts) {
    minX = Math.min(minX, part.position[0] - part.size[0] / 2);
    minY = Math.min(minY, part.position[1] - part.size[1] / 2);
    minZ = Math.min(minZ, part.position[2] - part.size[2] / 2);
    maxX = Math.max(maxX, part.position[0] + part.size[0] / 2);
    maxY = Math.max(maxY, part.position[1] + part.size[1] / 2);
    maxZ = Math.max(maxZ, part.position[2] + part.size[2] / 2);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * Re-resolve a placed generator instance from its stored `meta` (`{ assetId, seed, ...params }`): look
 * up the generator, parse its params off `meta` against the schema, and generate. Returns null when
 * `assetId` names no registered generator. This is what a runtime renderer calls per placed instance.
 * @internal
 */
export function resolveGeneratorAsset(meta: Record<string, unknown> | undefined): GeneratedAsset | null {
  const assetId = typeof meta?.["assetId"] === "string" ? (meta["assetId"] as string) : undefined;
  if (assetId === undefined) return null;
  const generator = generators.get(assetId);
  if (generator === undefined) return null;
  const seed = typeof meta?.["seed"] === "string" ? (meta["seed"] as string) : assetId;
  const params: ParsedParams = parseParams(generator.schema, meta);
  return generator.generate(params, seed);
}
