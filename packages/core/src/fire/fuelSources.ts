// @skill jgengine-world
import type { PlantSpecies } from "../plants/species/plantSpecies";
import type { PlantStructure } from "../plants/structure/plantStructure";
import type { CanopyStand } from "./fireLandscape";
import { standardFuelModel, type FuelModel } from "./fuelModels";

/** The crown fuel one grown plant carries. */
export interface PlantCanopyFuel {
  /** Dry foliage mass, kg. */
  foliageKg: number;
  /** Dry mass of fine branchwood (1-h, under 6.35 mm across), kg. */
  fineWoodKg: number;
  /** Canopy fuel a crown fire consumes: foliage plus half the fine branchwood (Scott & Reinhardt 2001), kg. */
  availableKg: number;
  heightM: number;
  crownBaseM: number;
  crownRadiusM: number;
}

/**
 * Read a grown plant's crown fuel without changing it: foliage mass is its leaf area (from
 * `PlantGrowth.stats().leafAreaM2`) over the species' specific leaf area; fine branchwood is the
 * skeleton segments thinner than `fineWoodRadiusM` times the species' wood density.
 *
 * @capability fire-plant-fuel crown fuel (foliage and fine branchwood mass, height, base, radius) of a grown plant
 */
export function plantCanopyFuel(structure: PlantStructure, species: PlantSpecies, leafAreaM2: number, options: { fineWoodRadiusM?: number } = {}): PlantCanopyFuel {
  const foliageKg = species.leaf.sla > 0 ? Math.max(0, leafAreaM2) / species.leaf.sla : 0;
  const limit = options.fineWoodRadiusM ?? 0.003175;
  const { start, end, radiusStart, radiusEnd } = structure.segments;
  let fineVolume = 0;
  for (let i = 0; i < radiusStart.length; i++) {
    const r = ((radiusStart[i] ?? 0) + (radiusEnd[i] ?? 0)) / 2;
    if (r <= 0 || r > limit) continue;
    const dx = (end[i * 3] ?? 0) - (start[i * 3] ?? 0);
    const dy = (end[i * 3 + 1] ?? 0) - (start[i * 3 + 1] ?? 0);
    const dz = (end[i * 3 + 2] ?? 0) - (start[i * 3 + 2] ?? 0);
    fineVolume += Math.PI * r * r * Math.hypot(dx, dy, dz);
  }
  const fineWoodKg = fineVolume * species.wood.densityKgM3;
  return {
    foliageKg,
    fineWoodKg,
    availableKg: foliageKg + 0.5 * fineWoodKg,
    heightM: structure.stats.heightM,
    crownBaseM: structure.stats.crownBaseM,
    crownRadiusM: structure.stats.crownRadiusM,
  };
}

/** Where a fire grid sits in the world. */
export interface FireGridFrame {
  cols: number;
  rows: number;
  cellSize: number;
  originX?: number;
  originZ?: number;
}

/**
 * Spread plants' crown fuel over a fire grid as canopy stands: each crown's available fuel is shared
 * between the cells its disc overlaps, by overlap area; a cell's cover is the crown area over it
 * (capped at 1), its height the tallest crown, its base the lowest, and its bulk density the load over
 * that crown depth.
 *
 * @capability fire-canopy-raster turn placed plants' crown fuel into per-cell canopy stands for a fire landscape
 */
export function rasterizeCanopyFuel(
  frame: FireGridFrame,
  plants: readonly { x: number; z: number; fuel: PlantCanopyFuel }[],
  options: { foliarMoisture?: number } = {},
): { canopies: CanopyStand[]; canopy: Int32Array } {
  const { cols, rows, cellSize } = frame;
  const ox = frame.originX ?? 0;
  const oz = frame.originZ ?? 0;
  const n = cols * rows;
  const load = new Float64Array(n);
  const cover = new Float64Array(n);
  const height = new Float64Array(n);
  const base = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const cellArea = cellSize * cellSize;
  const coveredCells: number[] = [];
  const coveredArea: number[] = [];
  const sub = 4;
  for (const plant of plants) {
    const { fuel } = plant;
    if (fuel.availableKg <= 0) continue;
    const radius = Math.max(0, fuel.crownRadiusM);
    coveredCells.length = 0;
    coveredArea.length = 0;
    let total = 0;
    const c0 = Math.max(0, Math.floor((plant.x - radius - ox) / cellSize));
    const c1 = Math.min(cols - 1, Math.floor((plant.x + radius - ox) / cellSize));
    const r0 = Math.max(0, Math.floor((plant.z - radius - oz) / cellSize));
    const r1 = Math.min(rows - 1, Math.floor((plant.z + radius - oz) / cellSize));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        let inside = 0;
        for (let a = 0; a < sub; a++) {
          for (let b = 0; b < sub; b++) {
            const dx = ox + (c + (a + 0.5) / sub) * cellSize - plant.x;
            const dz = oz + (r + (b + 0.5) / sub) * cellSize - plant.z;
            if (dx * dx + dz * dz <= radius * radius) inside++;
          }
        }
        if (inside === 0) continue;
        const area = (inside / (sub * sub)) * cellArea;
        coveredCells.push(r * cols + c);
        coveredArea.push(area);
        total += area;
      }
    }
    if (total === 0) {
      const c = Math.floor((plant.x - ox) / cellSize);
      const r = Math.floor((plant.z - oz) / cellSize);
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      coveredCells.push(r * cols + c);
      total = Math.min(cellArea, Math.PI * radius * radius);
      coveredArea.push(total);
    }
    for (let k = 0; k < coveredCells.length; k++) {
      const i = coveredCells[k] ?? 0;
      const area = coveredArea[k] ?? 0;
      load[i] = (load[i] ?? 0) + (fuel.availableKg * area) / total / cellArea;
      cover[i] = Math.min(1, (cover[i] ?? 0) + area / cellArea);
      height[i] = Math.max(height[i] ?? 0, fuel.heightM);
      base[i] = Math.min(base[i] ?? Number.POSITIVE_INFINITY, fuel.crownBaseM);
    }
  }
  const canopies: CanopyStand[] = [];
  const canopy = new Int32Array(n).fill(-1);
  const foliarMoisture = options.foliarMoisture ?? 1;
  for (let i = 0; i < n; i++) {
    const l = load[i] ?? 0;
    if (l <= 0) continue;
    const top = height[i] ?? 0;
    const bottom = Math.min(top, base[i] ?? 0);
    canopy[i] = canopies.length;
    canopies.push({ cover: cover[i] ?? 0, heightM: top, baseHeightM: bottom, bulkDensity: l / Math.max(0.5, top - bottom), foliarMoisture });
  }
  return { canopies, canopy };
}

/**
 * Build a fire grid's ground from samplers: elevation at each cell centre and a standard fuel model
 * code (Scott & Burgan `GR2`, Anderson `FM8`, non-burnable `NB9`, ...) for what covers the ground.
 * The game owns the mapping from its terrain, biomes or ground layers to fuel codes.
 *
 * @capability fire-terrain-fuel sample terrain height and ground-cover fuel codes into a fire landscape's elevation and fuel grids
 */
export function sampleFireGround(
  frame: FireGridFrame,
  sample: { heightAt?: (x: number, z: number) => number; fuelAt: (x: number, z: number) => string },
): { elevation: Float32Array; fuels: FuelModel[]; fuel: Uint8Array } {
  const { cols, rows, cellSize } = frame;
  const ox = frame.originX ?? 0;
  const oz = frame.originZ ?? 0;
  const elevation = new Float32Array(cols * rows);
  const fuel = new Uint8Array(cols * rows);
  const fuels: FuelModel[] = [];
  const index = new Map<string, number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + (c + 0.5) * cellSize;
      const z = oz + (r + 0.5) * cellSize;
      const i = r * cols + c;
      elevation[i] = sample.heightAt?.(x, z) ?? 0;
      const code = sample.fuelAt(x, z);
      let k = index.get(code);
      if (k === undefined) {
        const model = standardFuelModel(code);
        if (model === undefined) throw new Error(`unknown fuel model code ${code}`);
        if (fuels.length >= 255) throw new Error("a fire grid holds at most 255 fuel models");
        k = fuels.length;
        fuels.push(model);
        index.set(code, k);
      }
      fuel[i] = k;
    }
  }
  return { elevation, fuels, fuel };
}

/**
 * Share of the sun reaching each cell's surface fuel, 0..1, for a fuel moisture model's `exposure`:
 * the cosine of the sun on the cell's slope relative to flat ground (capped at 1), times the gaps
 * between crowns. `sunAzimuth` is radians in the grid plane from +x towards +z; elevation is above the horizon.
 *
 * @capability fire-sun-exposure per-cell sun on surface fuel from terrain slope, aspect and canopy cover
 */
export function sunExposure(
  frame: FireGridFrame,
  elevation: ArrayLike<number>,
  sun: { azimuth: number; elevation: number },
  canopy?: { canopies: readonly CanopyStand[]; canopy: ArrayLike<number> },
): Float32Array {
  const { cols, rows, cellSize } = frame;
  const out = new Float32Array(cols * rows);
  const sy = Math.sin(sun.elevation);
  if (sy <= 0) return out;
  const sx = Math.cos(sun.elevation) * Math.cos(sun.azimuth);
  const sz = Math.cos(sun.elevation) * Math.sin(sun.azimuth);
  const at = (c: number, r: number): number => elevation[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))] ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = (at(c + 1, r) - at(c - 1, r)) / ((Math.min(cols - 1, c + 1) - Math.max(0, c - 1)) * cellSize || 1);
      const gz = (at(c, r + 1) - at(c, r - 1)) / ((Math.min(rows - 1, r + 1) - Math.max(0, r - 1)) * cellSize || 1);
      const incidence = (-gx * sx + sy - gz * sz) / Math.sqrt(gx * gx + 1 + gz * gz);
      const i = r * cols + c;
      const k = canopy?.canopy[i] ?? -1;
      const stand = k >= 0 ? canopy?.canopies[k] : undefined;
      out[i] = Math.min(1, Math.max(0, incidence / sy)) * (1 - (stand?.cover ?? 0));
    }
  }
  return out;
}
