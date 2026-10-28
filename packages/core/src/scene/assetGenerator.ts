/**
 * Parts generators: a generator (`@jgengine/core/generator/generator`) whose `output` is
 * {@link PARTS_OUTPUT} returns box parts, so a slider-driven prop (a bookcase with width, shelves
 * and book density; a building with floors and bays) lives in the catalog beside static GLBs. A
 * placed instance stores only `{ assetId, seed, ...params }`; the geometry regrows at runtime.
 * Concrete generators (building, bookcase) register from engine, game or example code with
 * `registerGenerator`.
 *
 * @capability asset-generator seeded parametric geometry registered as a placeable asset
 */
import { getGenerator, runGenerator, type GeneratorDefinition } from "../generator/generator";
import { getSceneKind } from "./sceneKinds";

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

/** The output family of a generator that returns {@link GeneratedAsset} parts. */
export const PARTS_OUTPUT = "parts";

/** True when a generate result has the {@link GeneratedAsset} shape. */
export function isGeneratedAsset(value: unknown): value is GeneratedAsset {
  if (typeof value !== "object" || value === null) return false;
  return "parts" in value && Array.isArray(value.parts) && "bounds" in value && typeof value.bounds === "object" && value.bounds !== null;
}

/** The registered parts generator for an asset id, or undefined when the id names none. @internal */
export function getPartsGenerator(assetId: string): GeneratorDefinition | undefined {
  const definition = getGenerator(assetId);
  return definition?.output === PARTS_OUTPUT ? definition : undefined;
}

/** An object's generator: its kind's `generator`, else the parts generator its `meta.assetId` names. @internal */
export function generatorForObject(kind: string, meta: Readonly<Record<string, unknown>> | undefined): GeneratorDefinition | undefined {
  const kindGenerator = getSceneKind(kind)?.generator;
  return kindGenerator === undefined ? partsGeneratorFor(meta) : getGenerator(kindGenerator);
}

/** The parts generator a placed marker's `meta.assetId` names, or undefined. */
export function partsGeneratorFor(meta: Readonly<Record<string, unknown>> | undefined): GeneratorDefinition | undefined {
  const assetId = meta?.["assetId"];
  return typeof assetId === "string" ? getPartsGenerator(assetId) : undefined;
}

/**
 * Regrow a placed parts-generator instance from its stored `meta` (`{ assetId, seed, ...params }`):
 * parse the params against the generator's schema and generate. Null when `assetId` names no
 * registered parts generator. A runtime renderer calls this per placed instance.
 * @internal
 */
export function resolveGeneratorAsset(meta: Readonly<Record<string, unknown>> | undefined): GeneratedAsset | null {
  const definition = partsGeneratorFor(meta);
  if (definition === undefined) return null;
  const asset = runGenerator(definition, meta, { fallbackSeed: definition.id });
  return isGeneratedAsset(asset) ? asset : null;
}
