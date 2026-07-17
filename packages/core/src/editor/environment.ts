import type { WorldBounds } from "../world/features";
import type { AvoidZone } from "../world/geometry";
import { clearanceZonesFrom, DEFAULT_CLEARANCE_KINDS, type ClearanceOptions } from "../world/scatterRegion";
import type { TerraformSnapshot } from "../world/terraform";
import { editorDocumentBounds } from "./document";
import type { EditorDocument } from "./types";

/**
 * World-authoring convergence (#1018, epic #1006 Phase 4): derive the **coordinate/placement**
 * content of an `environment()` world from the scene document, so a game with an authored document
 * needs no coordinate arrays in `world.ts` — the remaining `world.ts` surface is engine tuning
 * (noise, materials, sky preset, physics). Terrain footprint follows the authored objects, ground
 * clearings come from authored spawns/POIs (`clearanceZonesFrom`), and the sculpt snapshot is the
 * document's own terrain overlay. Pure and serializable; consumers pass the result straight to
 * `environment({ terrain: terrain({ bounds }), clearings, sculpt })`.
 */

/** Options controlling how {@link environmentContentFromDocument} sizes and clears the world. */
export interface EnvironmentContentOptions extends ClearanceOptions {
  /** Padding (m) added around the authored objects' extent when sizing the terrain. Default 24. */
  padding?: number;
  /** Minimum terrain footprint so a sparse document still yields a walkable world. Default 64×64. */
  minBounds?: WorldBounds;
}

/** The coordinate/placement content of a world, derived from its scene document. */
export interface EnvironmentContent {
  /** Terrain footprint (origin-centered) sized to cover every authored object plus padding. */
  bounds: WorldBounds;
  /** Ground-flatten discs under authored spawns/plots/POIs — feed `environment({ clearings })`. */
  clearings: AvoidZone[];
  /** The document's authored sculpt snapshot, when it has one — feed `environment({ sculpt })`. */
  sculpt?: TerraformSnapshot;
}

/**
 * The origin-centered terrain footprint that covers every authored object in a document, padded and
 * floored to `minBounds`. An empty document yields exactly `minBounds`. Because `environment()`
 * terrain is centered on the origin, the footprint is sized symmetrically to the farthest object on
 * each axis, so no authored object falls off the ground.
 * @capability world-convergence size terrain to the authored document instead of a hardcoded bounds
 */
export function terrainBoundsFromDocument(doc: EditorDocument, options: EnvironmentContentOptions = {}): WorldBounds {
  const padding = options.padding ?? 24;
  const min = options.minBounds ?? { w: 64, d: 64 };
  const bounds = editorDocumentBounds(doc);
  if (bounds === null) return { w: min.w, d: min.d };
  const halfX = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
  const halfZ = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
  return {
    w: Math.max(min.w, halfX * 2 + padding * 2),
    d: Math.max(min.d, halfZ * 2 + padding * 2),
  };
}

/**
 * Derives the coordinate/placement content of an `environment()` world from its scene document:
 * terrain footprint (via {@link terrainBoundsFromDocument}), ground clearings under authored
 * spawns/POIs (via `clearanceZonesFrom`), and the document's sculpt snapshot. This is the seam that
 * lets a game author its world footprint and flatten regions in the editor instead of hardcoding
 * them — the `world.ts` that consumes it carries only engine tuning.
 * @capability world-convergence derive environment coordinate content from the scene document
 */
export function environmentContentFromDocument(
  doc: EditorDocument,
  options: EnvironmentContentOptions = {},
): EnvironmentContent {
  const clearanceOptions: ClearanceOptions = {
    kinds: options.kinds ?? DEFAULT_CLEARANCE_KINDS,
    ...(options.ids === undefined ? {} : { ids: options.ids }),
    ...(options.defaultClearance === undefined ? {} : { defaultClearance: options.defaultClearance }),
    ...(options.feather === undefined ? {} : { feather: options.feather }),
  };
  return {
    bounds: terrainBoundsFromDocument(doc, options),
    clearings: clearanceZonesFrom(doc, clearanceOptions),
    ...(doc.terrain === undefined ? {} : { sculpt: doc.terrain }),
  };
}
