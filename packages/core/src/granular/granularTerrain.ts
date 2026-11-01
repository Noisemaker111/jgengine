// @skill jgengine-world
/**
 * A {@link GranularLayer} laid over an {@link EditableTerrain}: one granular cell per terrain vertex,
 * loose material on top of a bed the terrain's ground defines, and every change written back to the
 * terrain as a {@link TerraformDelta}, so undo, save and replication see sand moving like any other
 * sculpt. Loose depth and material come from callbacks; {@link landformLooseCover} reads them from a
 * landform simulation's cover.
 *
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
import type { LandformSurface, LandformSurfaceKind } from "../landform/materials/landformSurface";
import type { EditableTerrain, TerraformDelta } from "../terrain/terraform";
import { createGranularLayer, type GranularLayer, type GranularLayerConfig, type GranularPressReport, type GranularStepReport } from "./granularLayer";
import type { GranularMaterial } from "./granularMaterial";

/** Options for {@link createGranularTerrain}. */
export interface GranularTerrainOptions {
  materials: readonly GranularMaterial[];
  /** Loose depth over bedrock at a world point, m. Default 0: only what is deposited is loose. */
  looseDepth?: (x: number, z: number) => number;
  /** Material index at a world point. Default 0. */
  materialAt?: (x: number, z: number) => number;
  layer?: Pick<GranularLayerConfig, "courant" | "maxSubsteps" | "sleepSteps" | "startAwake" | "gravity">;
}

/** A granular layer bound to a terrain; positions are world x/z. */
export interface GranularTerrain {
  readonly layer: GranularLayer;
  /** Advance the flow and write what moved into the terrain. */
  step(dt: number): GranularStepReport & { delta: TerraformDelta };
  /** Solid volume taken, m³. */
  dig(x: number, z: number, radius: number, depth: number): number;
  deposit(x: number, z: number, radius: number, volume: number, material?: number): number;
  press(x: number, z: number, radius: number, load: number): GranularPressReport;
  roll(x0: number, z0: number, x1: number, z1: number, width: number, diameter: number, load: number): GranularPressReport;
  /** Loose depth at the nearest vertex, m. */
  depthAt(x: number, z: number): number;
  /** Write pending changes into the terrain and return them as one delta. */
  sync(): TerraformDelta;
  /** Re-read the ground after the terrain was edited by something else, keeping the loose material. */
  resync(): void;
}

/**
 * Bind a granular layer to a terrain's vertex grid.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function createGranularTerrain(terrain: EditableTerrain, options: GranularTerrainOptions): GranularTerrain {
  const bounds = terrain.gridBounds;
  const cols = terrain.cols + 1;
  const rows = terrain.rows + 1;
  const sx = (bounds.maxX - bounds.minX) / terrain.cols;
  const sz = (bounds.maxZ - bounds.minZ) / terrain.rows;
  const vertexX = (gx: number): number => bounds.minX + gx * sx;
  const vertexZ = (gz: number): number => bounds.minZ + gz * sz;
  const count = cols * rows;
  const ground = new Float64Array(count);
  const bed = new Float64Array(count);
  const depth = new Float64Array(count);
  const material = new Uint8Array(count);
  for (let gz = 0; gz < rows; gz += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      const i = gz * cols + gx;
      const x = vertexX(gx);
      const z = vertexZ(gz);
      const top = terrain.sampleHeight(x, z);
      const loose = Math.max(0, options.looseDepth?.(x, z) ?? 0);
      ground[i] = top;
      depth[i] = loose;
      bed[i] = top - loose;
      material[i] = options.materialAt?.(x, z) ?? 0;
    }
  }
  const layer = createGranularLayer({ cols, rows, spacingX: sx, spacingZ: sz, materials: options.materials, bed, depth, material, ...options.layer });
  // Surface height last written into the terrain, per vertex.
  const written = ground;

  function sync(): TerraformDelta {
    const indices: number[] = [];
    const before: number[] = [];
    const after: number[] = [];
    for (const c of layer.drainChanges()) {
      const next = layer.surface(c);
      const change = next - (written[c] ?? next);
      if (change === 0) continue;
      const gx = c % cols;
      const gz = Math.floor(c / cols);
      const offset = terrain.heightOffsetAt(vertexX(gx), vertexZ(gz));
      indices.push(c);
      before.push(offset);
      after.push(offset + change);
      written[c] = next;
    }
    const delta = { indices, before, after };
    if (indices.length > 0) terrain.applyDelta(delta);
    return delta;
  }

  const local = (x: number, z: number): [number, number] => [x - bounds.minX, z - bounds.minZ];

  return {
    layer,
    step(dt) {
      const report = layer.step(dt);
      return { ...report, delta: sync() };
    },
    dig(x, z, radius, deep) {
      const [lx, lz] = local(x, z);
      return layer.dig(lx, lz, radius, deep);
    },
    deposit(x, z, radius, volume, materialIndex) {
      const [lx, lz] = local(x, z);
      return layer.deposit(lx, lz, radius, volume, materialIndex);
    },
    press(x, z, radius, load) {
      const [lx, lz] = local(x, z);
      return layer.press(lx, lz, radius, load);
    },
    roll(x0, z0, x1, z1, width, diameter, load) {
      const [a, b] = local(x0, z0);
      const [c, d] = local(x1, z1);
      return layer.roll(a, b, c, d, width, diameter, load);
    },
    depthAt(x, z) {
      const gx = Math.min(cols - 1, Math.max(0, Math.round((x - bounds.minX) / sx)));
      const gz = Math.min(rows - 1, Math.max(0, Math.round((z - bounds.minZ) / sz)));
      return layer.depth(gz * cols + gx);
    },
    sync,
    resync() {
      sync();
      for (let gz = 0; gz < rows; gz += 1) {
        for (let gx = 0; gx < cols; gx += 1) {
          const i = gz * cols + gx;
          const top = terrain.sampleHeight(vertexX(gx), vertexZ(gz));
          layer.bed[i] = top - layer.depth(i);
          written[i] = top;
        }
      }
      layer.wake(0.5 * (bounds.maxX - bounds.minX), 0.5 * (bounds.maxZ - bounds.minZ), Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ));
      layer.drainChanges();
    },
  };
}

/** Where a landform's cover grid sits in the world: cell (gx, gz) spans `origin + g · cellSize` to the next cell. */
export interface LandformCoverPlacement {
  originX: number;
  originZ: number;
  /** Granular material index for each loose surface kind; kinds left out count as bedrock. */
  materials: Partial<Record<LandformSurfaceKind, number>>;
}

/**
 * Loose depth and material callbacks for {@link createGranularTerrain} from a landform simulation's cover:
 * depth is the cover thickness, material the heaviest-weighted loose kind the placement maps.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function landformLooseCover(surface: LandformSurface, placement: LandformCoverPlacement): Pick<GranularTerrainOptions, "looseDepth" | "materialAt"> {
  const kinds = surface.kinds.length;
  const cellOf = (x: number, z: number): number => {
    const gx = Math.min(surface.cols - 1, Math.max(0, Math.floor((x - placement.originX) / surface.cellSize)));
    const gz = Math.min(surface.rows - 1, Math.max(0, Math.floor((z - placement.originZ) / surface.cellSize)));
    return gz * surface.cols + gx;
  };
  const kindOf = (cell: number): number | undefined => {
    let best: number | undefined;
    let weight = 0;
    for (let k = 0; k < kinds; k += 1) {
      const kind = surface.kinds[k];
      if (kind === undefined) continue;
      const index = placement.materials[kind];
      const w = surface.weights[cell * kinds + k] ?? 0;
      if (index !== undefined && w > weight) {
        weight = w;
        best = index;
      }
    }
    return best;
  };
  return {
    looseDepth: (x, z) => {
      const cell = cellOf(x, z);
      return kindOf(cell) === undefined ? 0 : (surface.coverDepth[cell] ?? 0);
    },
    materialAt: (x, z) => kindOf(cellOf(x, z)) ?? 0,
  };
}
