import * as THREE from "three";
import { TERRAIN_MATERIAL_COLORS } from "@jgengine/core/editor/terrainMaterials";
import type { EditableTerrain } from "@jgengine/core/world/terraform";

/**
 * Live authored paint channels needed to sample a terrain's material stack without its heightfield.
 * With the grid fields present, paint is filtered across neighbouring cells instead of snapping to each cell.
 */
export type TerrainPaintSource = Pick<EditableTerrain, "layers" | "weightsAt" | "surfaceAt"> &
  Partial<Pick<EditableTerrain, "gridBounds" | "cols" | "rows">>;
/**
 * Blends authored paint over the base ground color already in `out`; returns false (leaving `out`
 * untouched) where no painted cell contributes.
 */
export type TerrainPaintColorSampler = (x: number, z: number, out: THREE.Color) => boolean;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Shares layer tint, opacity and linear weighted-color blending between editor and runtime ground.
 * Paint lives on a coarse cell grid; when the source exposes that grid, each sample smoothly blends
 * the four surrounding cell centres (unpainted cells contribute the caller's base color in `out`),
 * so painted paths and clearings get soft edges instead of grid-aligned stair steps.
 * @capability terrain-paint-color sample authored terrain surfaces and blended layers for shared ground rendering
 */
export function createTerrainPaintColorSampler(terrain: TerrainPaintSource): TerrainPaintColorSampler {
  const layers = terrain.layers;
  const colors = layers.map(layer => new THREE.Color(layer.tint ?? TERRAIN_MATERIAL_COLORS[layer.surface] ?? "#7c7f86"));
  const defaults = new Map(Object.entries(TERRAIN_MATERIAL_COLORS).map(([id, color]) => [id, new THREE.Color(color)]));

  const cellColor = (x: number, z: number, out: THREE.Color): boolean => {
    const weights = terrain.weightsAt(x, z);
    if (layers.length > 0 && weights.length === layers.length) {
      let total = 0, r = 0, g = 0, b = 0;
      for (let i = 0; i < layers.length; i++) {
        const weight = weights[i]! * (layers[i]!.opacity ?? 1);
        if (weight <= 0) continue;
        const color = colors[i]!;
        r += color.r * weight; g += color.g * weight; b += color.b * weight;
        total += weight;
      }
      if (total > 0) { out.setRGB(r / total, g / total, b / total); return true; }
      return false;
    }
    const surface = terrain.surfaceAt(x, z);
    if (surface === null) return false;
    const index = layers.findIndex(layer => layer.surface === surface);
    if (index >= 0) {
      if ((layers[index]!.opacity ?? 1) <= 0) return false;
      out.copy(colors[index]!); return true;
    }
    const color = defaults.get(surface);
    if (color === undefined) return false;
    out.copy(color); return true;
  };

  const cols = terrain.cols;
  const rows = terrain.rows;
  if (terrain.gridBounds === undefined || cols === undefined || rows === undefined || cols < 2 || rows < 2) return cellColor;
  const grid = terrain.gridBounds;

  const cellW = (grid.maxX - grid.minX) / cols;
  const cellD = (grid.maxZ - grid.minZ) / rows;
  const base = new THREE.Color();
  const corner = new THREE.Color();
  return (x, z, out) => {
    if (x < grid.minX || x > grid.maxX || z < grid.minZ || z > grid.maxZ) return false;
    const fx = (x - grid.minX) / cellW - 0.5;
    const fz = (z - grid.minZ) / cellD - 0.5;
    const gx = Math.floor(fx);
    const gz = Math.floor(fz);
    const tx = smooth(fx - gx);
    const tz = smooth(fz - gz);
    base.copy(out);
    let painted = false, r = 0, g = 0, b = 0;
    for (let dz = 0; dz <= 1; dz++) {
      const cz = Math.min(rows - 1, Math.max(0, gz + dz));
      const wz = dz === 0 ? 1 - tz : tz;
      for (let dx = 0; dx <= 1; dx++) {
        const cx = Math.min(cols - 1, Math.max(0, gx + dx));
        const w = (dx === 0 ? 1 - tx : tx) * wz;
        if (w <= 0) continue;
        corner.copy(base);
        if (cellColor(grid.minX + (cx + 0.5) * cellW, grid.minZ + (cz + 0.5) * cellD, corner)) painted = true;
        r += corner.r * w; g += corner.g * w; b += corner.b * w;
      }
    }
    if (!painted) return false;
    out.setRGB(r, g, b);
    return true;
  };
}
