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

const LAKEBED_CELL = 1.5;
/** Meters the bed drops below the water box's bottom face at full depth. */
const LAKEBED_UNDERCUT = 1.2;
/** Meters from the shoreline over which the bed ramps to full depth. */
const LAKEBED_SHORE_RAMP = 4;

/**
 * Derives a terrain-depression sculpt snapshot from the document's authored `water` volumes: each
 * water box carves a lake bed that ramps from the shoreline down to below the box's bottom face, so
 * an editor-authored pond/lake sits *in* the ground instead of floating as a sheet on top of it (and
 * ground-sampled vegetation sinks below the surface rather than growing through it). Returns
 * `undefined` when the document has no water volumes.
 * @capability world-convergence carve lake beds under authored water volumes
 */
export function lakebedFromWaterVolumes(doc: EditorDocument): TerraformSnapshot | undefined {
  const waters = doc.volumes.filter(
    (volume) => volume.kind === "water" && volume.halfExtents !== undefined,
  );
  if (waters.length === 0) return undefined;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const water of waters) {
    const he = water.halfExtents!;
    minX = Math.min(minX, water.center.x - he.x - LAKEBED_SHORE_RAMP);
    minZ = Math.min(minZ, water.center.z - he.z - LAKEBED_SHORE_RAMP);
    maxX = Math.max(maxX, water.center.x + he.x + LAKEBED_SHORE_RAMP);
    maxZ = Math.max(maxZ, water.center.z + he.z + LAKEBED_SHORE_RAMP);
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / LAKEBED_CELL));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / LAKEBED_CELL));
  const vertsX = cols + 1;
  const vertsZ = rows + 1;
  const offsets: number[] = new Array(vertsX * vertsZ).fill(0);
  for (let iz = 0; iz < vertsZ; iz += 1) {
    for (let ix = 0; ix < vertsX; ix += 1) {
      const x = minX + (ix / cols) * (maxX - minX);
      const z = minZ + (iz / rows) * (maxZ - minZ);
      let offset = 0;
      for (const water of waters) {
        const he = water.halfExtents!;
        // Signed distance to the water rectangle on XZ: negative inside, positive outside.
        const dx = Math.abs(x - water.center.x) - he.x;
        const dz = Math.abs(z - water.center.z) - he.z;
        const dist = Math.max(dx, dz);
        if (dist >= 0) continue;
        const depth = he.y * 2 + LAKEBED_UNDERCUT;
        const t = Math.min(1, -dist / LAKEBED_SHORE_RAMP);
        // Smoothstep the shore ramp so the bed curves like a basin, not a funnel.
        const w = t * t * (3 - 2 * t);
        offset = Math.min(offset, -depth * w);
      }
      offsets[iz * vertsX + ix] = offset;
    }
  }
  return {
    bounds: { minX, minZ, maxX, maxZ },
    cellSize: LAKEBED_CELL,
    cols,
    rows,
    offsets,
    surfaces: new Array(cols * rows).fill(null),
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
  // The authored sculpt snapshot wins outright when the document carries one (the author owns the
  // ground); otherwise water volumes derive their own lake-bed depression.
  const sculpt = doc.terrain ?? lakebedFromWaterVolumes(doc);
  return {
    bounds: terrainBoundsFromDocument(doc, options),
    clearings: clearanceZonesFrom(doc, clearanceOptions),
    ...(sculpt === undefined ? {} : { sculpt }),
  };
}
