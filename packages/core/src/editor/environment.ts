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
/** Wavelength (m) of the seeded shore-ramp modulation that keeps the waterline organic. */
const LAKEBED_SHORE_NOISE_SCALE = 5.5;

/** Deterministic 2D value noise in [0,1] — the shoreline wobble must be stable across runs. */
function lakebedShoreNoise(x: number, z: number): number {
  const lattice = (ix: number, iz: number): number => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iz);
  const b = lattice(ix + 1, iz);
  const c = lattice(ix, iz + 1);
  const d = lattice(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

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
        // Rounded-rectangle signed distance on XZ (negative inside): the carve — and with it the
        // waterline — rounds the box corners instead of stamping a sharp rectangle in the ground.
        const rr = Math.min(he.x, he.z) * 0.3;
        const ax = Math.abs(x - water.center.x) - he.x + rr;
        const az = Math.abs(z - water.center.z) - he.z + rr;
        const raw = Math.hypot(Math.max(ax, 0), Math.max(az, 0)) + Math.min(Math.max(ax, az), 0) - rr;
        if (raw >= 0) continue;
        // Seeded wobble wanders the shoreline up to ±0.8 m, ramped in from the box edge so the
        // carve never escapes the authored footprint.
        const wobble = (lakebedShoreNoise(x / LAKEBED_SHORE_NOISE_SCALE, z / LAKEBED_SHORE_NOISE_SCALE) - 0.5) * 1.6;
        const dist = raw + wobble * Math.min(1, -raw / 1.5);
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
