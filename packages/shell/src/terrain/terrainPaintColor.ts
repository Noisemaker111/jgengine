import * as THREE from "three";
import { TERRAIN_MATERIAL_COLORS } from "@jgengine/core/editor/terrainMaterials";
import type { EditableTerrain } from "@jgengine/core/world/terraform";

/** Live authored paint channels needed to sample a terrain's material stack without its heightfield. */
export type TerrainPaintSource = Pick<EditableTerrain, "layers" | "weightsAt" | "surfaceAt">;
/** Writes authored paint into an existing linear color; returns false for unpainted ground. */
export type TerrainPaintColorSampler = (x: number, z: number, out: THREE.Color) => boolean;

/**
 * Shares layer tint, opacity and linear weighted-color blending between editor and runtime ground.
 * @capability terrain-paint-color sample authored terrain surfaces and blended layers for shared ground rendering
 */
export function createTerrainPaintColorSampler(terrain: TerrainPaintSource): TerrainPaintColorSampler {
  const layers = terrain.layers;
  const colors = layers.map(layer => new THREE.Color(layer.tint ?? TERRAIN_MATERIAL_COLORS[layer.surface] ?? "#7c7f86"));
  const defaults = new Map(Object.entries(TERRAIN_MATERIAL_COLORS).map(([id, color]) => [id, new THREE.Color(color)]));
  return (x, z, out) => {
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
}
