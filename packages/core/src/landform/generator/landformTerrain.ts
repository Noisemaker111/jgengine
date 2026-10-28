// @skill jgengine-world
/**
 * One grown landform, ready for the ground: heights, surface material weights and dune sand per
 * cell, from a single deterministic run of the landscape and dune models. `growLandform` is the
 * whole job, so a worker and the main thread grow the same terrain from the same params and seed.
 * `landformTerrainSnapshot` turns it into the editor's terrain document, so the editor and every
 * runtime that reads a sculpted terrain use it with no game code.
 *
 * @capability landform-generator grow a terrain heightfield and its material layers from geology, rivers and wind, for the editor and runtime
 */

import type { TerraformSnapshot, TerrainMaterialLayer } from "../../terrain/terraform";
import { createDuneField, type WindMode } from "../dunes/duneField";
import { createLandscapeEvolution, type LandformParams } from "../evolution/landscapeEvolution";
import type { RockLayer } from "../evolution/rockStrata";
import { LANDFORM_SURFACE_KINDS, landformSurface, type LandformSurfaceKind } from "../materials/landformSurface";

/** What a landform is grown from: plain data, so it crosses to a worker unchanged. */
export interface LandformRecipe {
  /** Cells per side. 16..256. */
  side: number;
  /** Cell side in metres. */
  cellSize: number;
  /** Years of erosion. */
  years: number;
  /** Rock uplift in mm/yr. */
  uplift: number;
  /** Stream-power erodibility K. */
  erodibility: number;
  /** Hillslope diffusivity in m²/yr. */
  diffusivity: number;
  /** River deposition coefficient G. */
  deposition: number;
  /** Angle of repose of debris in degrees. */
  reposeAngle: number;
  /** Sea level in metres, or none. */
  seaLevel: number | null;
  /** Thickness in metres of a hard caprock over soft rock; 0 is one uniform rock. */
  caprock: number;
  /** Mean dune sand thickness in metres; 0 grows no dunes. */
  sand: number;
  /** The winds that drive the dunes. */
  wind: readonly WindMode[];
  /** Dune sweeps to run. */
  duneSweeps: number;
  /**
   * World metres per simulated metre. Landforms are close to self-similar, so a range grown with
   * kilometre-scale rivers can be shrunk to a game-sized map. Default 1.
   */
  scale?: number;
}

/** A grown landform in world metres (after {@link LandformRecipe.scale}). Heights are cell centres, row-major, row 0 at the north edge. */
export interface LandformTerrain {
  cols: number;
  rows: number;
  cellSize: number;
  /** Ground height per cell in metres, dunes included. */
  heights: Float32Array;
  /** Surface kinds, in {@link LandformTerrain.weights} order. */
  kinds: readonly LandformSurfaceKind[];
  /** Blend weights per cell and kind, cell-major; each cell sums to 1. */
  weights: Float32Array;
  /** Standing water depth per cell in metres (lakes and sea). */
  waterDepth: Float32Array;
  /** Dune sand thickness per cell in metres. */
  dunes: Float32Array;
}

/** Largest landform side `growLandform` accepts, so one job's work stays bounded. */
export const LANDFORM_TERRAIN_MAX_SIDE = 256;
// Most erosion steps one job runs; the time step grows to fit the years.
const MAX_STEPS = 300;

function caprockStrata(caprock: number): readonly RockLayer[] | undefined {
  if (!(caprock > 0)) return undefined;
  return [
    { id: "caprock", thickness: caprock, erodibility: 0.2, criticalAngle: 70, weathering: 0.2, yields: { gravel: 0.5, sand: 0.4, silt: 0.1 } },
    { id: "shale", thickness: 1, erodibility: 2, criticalAngle: 30, weathering: 1, yields: { gravel: 0.05, sand: 0.35, silt: 0.6 } },
  ];
}

/** Grow a landform from a recipe and seed: erosion first, then dunes over it. */
export function growLandform(recipe: LandformRecipe, seed: string): LandformTerrain {
  const side = Math.round(recipe.side);
  if (!(side >= 16 && side <= LANDFORM_TERRAIN_MAX_SIDE)) throw new Error(`landform side must be 16..${LANDFORM_TERRAIN_MAX_SIDE}, got ${recipe.side}`);
  const steps = Math.max(1, Math.min(MAX_STEPS, Math.ceil(recipe.years / 1e4)));
  const strata = caprockStrata(recipe.caprock);
  const params: Partial<LandformParams> = {
    uplift: recipe.uplift / 1000,
    erodibility: recipe.erodibility,
    diffusivity: recipe.diffusivity,
    deposition: recipe.deposition,
    reposeAngle: recipe.reposeAngle,
    timeStep: recipe.years / steps,
    ...(recipe.seaLevel === null ? {} : { seaLevel: recipe.seaLevel }),
    ...(strata === undefined ? {} : { strata: { layers: strata, top: recipe.caprock } }),
  };
  const model = createLandscapeEvolution({ grid: { cols: side, rows: side, cellSize: recipe.cellSize }, seed, params });
  for (let k = 0; k < steps; k += 1) model.step();
  const surface = landformSurface(model);
  const cells = side * side;
  const heights = new Float32Array(cells);
  const height = model.fields().height;
  for (let i = 0; i < cells; i += 1) heights[i] = height[i] ?? 0;
  const weights = Float32Array.from(surface.weights);
  const waterDepth = Float32Array.from(surface.waterDepth);
  const dunes = new Float32Array(cells);
  if (recipe.sand > 0 && recipe.wind.length > 0) {
    const field = createDuneField({ grid: { cols: side, rows: side, cellSize: recipe.cellSize }, seed: `${seed}/dunes`, initial: { sand: recipe.sand }, params: { wind: recipe.wind } });
    field.step(recipe.duneSweeps);
    const sand = field.thickness();
    const kinds = LANDFORM_SURFACE_KINDS.length;
    const sandKind = LANDFORM_SURFACE_KINDS.indexOf("sand");
    for (let i = 0; i < cells; i += 1) {
      const t = (waterDepth[i] ?? 0) > 0 ? 0 : sand[i] ?? 0;
      if (t <= 0) continue;
      dunes[i] = t;
      heights[i] = (heights[i] ?? 0) + t;
      // Sand buries the ground under it: a metre of dune sand is enough to hide it.
      const cover = t >= 1 ? 1 : t;
      for (let k = 0; k < kinds; k += 1) weights[i * kinds + k] = (weights[i * kinds + k] ?? 0) * (1 - cover) + (k === sandKind ? cover : 0);
    }
  }
  const scale = recipe.scale ?? 1;
  if (scale !== 1) for (const array of [heights, waterDepth, dunes]) for (let i = 0; i < cells; i += 1) array[i] = (array[i] ?? 0) * scale;
  return { cols: side, rows: side, cellSize: recipe.cellSize * scale, heights, kinds: [...LANDFORM_SURFACE_KINDS], weights, waterDepth, dunes };
}

/** Options for {@link landformTerrainSnapshot}. */
export interface LandformSnapshotOptions {
  /** World x, z of the terrain centre. Default the origin. */
  center?: readonly [number, number];
  /** Metres subtracted from every height, e.g. to put sea level at 0. Default 0. */
  datum?: number;
  /** Terrain paint id per surface kind. Default {@link LANDFORM_TERRAIN_SURFACES}. */
  surfaces?: Readonly<Record<LandformSurfaceKind, string>>;
}

/** The terrain paint palette id each landform surface kind paints by default. */
export const LANDFORM_TERRAIN_SURFACES: Readonly<Record<LandformSurfaceKind, string>> = { rock: "rock", gravel: "gravel", sand: "sand", mud: "mud", soil: "dirt" };

/**
 * The editor terrain document for a grown landform: cell centres become the sculpt grid's vertices,
 * and each surface kind becomes a material layer with per-cell blend weights.
 */
export function landformTerrainSnapshot(terrain: LandformTerrain, options: LandformSnapshotOptions = {}): TerraformSnapshot {
  const { cols, rows, cellSize, heights, kinds, weights } = terrain;
  const [cx, cz] = options.center ?? [0, 0];
  const datum = options.datum ?? 0;
  const snapCols = cols - 1;
  const snapRows = rows - 1;
  const width = snapCols * cellSize;
  const depth = snapRows * cellSize;
  const offsets: number[] = new Array<number>(cols * rows);
  for (let i = 0; i < cols * rows; i += 1) offsets[i] = (heights[i] ?? 0) - datum;
  const paint = options.surfaces ?? LANDFORM_TERRAIN_SURFACES;
  const layers: TerrainMaterialLayer[] = kinds.map((kind) => ({ id: `landform-${kind}`, surface: paint[kind], triplanar: kind === "rock" }));
  const k = kinds.length;
  const cellWeights: number[] = new Array<number>(snapCols * snapRows * k).fill(0);
  const surfaces: (string | null)[] = new Array<string | null>(snapCols * snapRows).fill(null);
  for (let row = 0; row < snapRows; row += 1) {
    for (let col = 0; col < snapCols; col += 1) {
      const cell = row * snapCols + col;
      const corners = [row * cols + col, row * cols + col + 1, (row + 1) * cols + col, (row + 1) * cols + col + 1];
      let best = 0;
      let bestWeight = -1;
      for (let kind = 0; kind < k; kind += 1) {
        let w = 0;
        for (const corner of corners) w += weights[corner * k + kind] ?? 0;
        w /= 4;
        cellWeights[cell * k + kind] = w;
        if (w > bestWeight) {
          bestWeight = w;
          best = kind;
        }
      }
      const kind = kinds[best];
      surfaces[cell] = kind === undefined ? null : paint[kind];
    }
  }
  return {
    bounds: { minX: cx - width / 2, minZ: cz - depth / 2, maxX: cx + width / 2, maxZ: cz + depth / 2 },
    cellSize,
    cols: snapCols,
    rows: snapRows,
    offsets,
    surfaces,
    layers,
    weights: cellWeights,
  };
}
