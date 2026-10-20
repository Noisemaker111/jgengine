import * as THREE from "three";
import { TERRAIN_MATERIAL_COLORS } from "@jgengine/core/editor/terrainMaterials";
import type { TerrainMaterialLayer } from "@jgengine/core/world/terraform";

import type { TerrainPaintSource } from "./terrainPaintColor";

/** Procedural ground response the terrain shader renders for a painted surface id. */
export type TerrainSurfaceClass = "ground" | "grass" | "dirt" | "gravel" | "rock" | "sand" | "mud" | "snow" | "road";

const CLASS_INDEX: Record<TerrainSurfaceClass, number> = {
  ground: 0, grass: 1, dirt: 2, gravel: 3, rock: 4, sand: 5, mud: 6, snow: 7, road: 8,
};

/** Authored-tiling neutral point per class: a layer's `tiling` divided by this scales the pattern. */
const CLASS_TILING: Record<TerrainSurfaceClass, number> = {
  ground: 3, grass: 3, dirt: 2, gravel: 2, rock: 4, sand: 3, mud: 2, snow: 3, road: 2,
};

const CLASS_ROUGHNESS: Record<TerrainSurfaceClass, number> = {
  ground: 0.92, grass: 0.95, dirt: 0.93, gravel: 0.88, rock: 0.82, sand: 0.96, mud: 0.8, snow: 0.78, road: 0.86,
};

const ALIASES: readonly (readonly [string, TerrainSurfaceClass])[] = [
  ["gravel", "gravel"], ["pebble", "gravel"], ["shingle", "gravel"], ["scree", "gravel"],
  ["grass", "grass"], ["moss", "grass"], ["meadow", "grass"], ["lawn", "grass"], ["turf", "grass"], ["leaf", "grass"],
  ["mud", "mud"], ["clay", "mud"], ["swamp", "mud"], ["bog", "mud"],
  ["sand", "sand"], ["beach", "sand"], ["dune", "sand"],
  ["snow", "snow"], ["ice", "snow"], ["frost", "snow"],
  ["road", "road"], ["asphalt", "road"], ["tarmac", "road"], ["concrete", "road"], ["pavement", "road"],
  ["rock", "rock"], ["stone", "rock"], ["cliff", "rock"], ["slate", "rock"], ["basalt", "rock"],
  ["dirt", "dirt"], ["soil", "dirt"], ["earth", "dirt"], ["path", "dirt"], ["trail", "dirt"], ["ash", "dirt"],
];

/**
 * Classifies a painted surface id (e.g. `"grass"`, `"dry-grass"`, `"cobble-stone"`) into the procedural
 * ground response the terrain shader draws for it; unknown ids get the generic `"ground"` response.
 */
export function terrainSurfaceClass(surface: string): TerrainSurfaceClass {
  const id = surface.toLowerCase();
  for (const [key, cls] of ALIASES) if (id === key) return cls;
  for (const [key, cls] of ALIASES) if (id.includes(key)) return cls;
  return "ground";
}

/** Shader index of a surface class (`jgSurface`'s `cls`); bit `1 << index` in a class mask. */
export function terrainSurfaceClassIndex(cls: TerrainSurfaceClass): number {
  return CLASS_INDEX[cls];
}

/** Default roughness the terrain shades a surface class with. */
export function terrainSurfaceRoughness(cls: TerrainSurfaceClass): number {
  return CLASS_ROUGHNESS[cls];
}

/** At most this many distinct paint layers reach the GPU; extra layers fold into the last slot. */
export const MAX_TERRAIN_PAINT_LAYERS = 8;

/** One GPU paint slot: authored hue plus the procedural response it renders with. */
export interface TerrainPaintSlot {
  color: THREE.Color;
  surfaceClass: TerrainSurfaceClass;
  classIndex: number;
  roughness: number;
  /** Pattern frequency multiplier from the layer's authored `tiling`. */
  scale: number;
}

/** Per-cell paint coverage packed for the shader: two RGBA8 planes holding up to eight layer weights. */
export interface TerrainPaintWeights {
  cols: number;
  rows: number;
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  slots: TerrainPaintSlot[];
  /** `cols*rows*4` bytes each: slots 0–3 and 4–7, 0..255 coverage scaled by layer opacity. */
  planes: [Uint8Array, Uint8Array];
}

function slotFor(surface: string, layer: TerrainMaterialLayer | undefined): TerrainPaintSlot {
  const surfaceClass = terrainSurfaceClass(surface);
  const tiling = layer?.tiling;
  return {
    color: new THREE.Color(layer?.tint ?? TERRAIN_MATERIAL_COLORS[surface] ?? "#7c7f86"),
    surfaceClass,
    classIndex: CLASS_INDEX[surfaceClass],
    roughness: layer?.roughness ?? CLASS_ROUGHNESS[surfaceClass],
    scale: tiling === undefined || tiling <= 0 ? 1 : Math.min(2, Math.max(0.5, CLASS_TILING[surfaceClass] / tiling)),
  };
}

/**
 * Packs a terrain's authored paint (layer stack, blend weights or hard surface ids) into per-cell
 * coverage planes for the terrain surface shader. Returns `undefined` when the source exposes no
 * cell grid. Pass `into` to rewrite an existing buffer in place after a paint stroke.
 */
export function packTerrainPaintWeights(source: TerrainPaintSource, into?: TerrainPaintWeights): TerrainPaintWeights | undefined {
  const { gridBounds, cols, rows } = source;
  if (gridBounds === undefined || cols === undefined || rows === undefined || cols < 1 || rows < 1) return undefined;
  const layers = source.layers;
  const slotIndex = new Map<string, number>();
  const slots: TerrainPaintSlot[] = [];
  const addSlot = (key: string, surface: string, layer: TerrainMaterialLayer | undefined): number => {
    const known = slotIndex.get(key);
    if (known !== undefined) return known;
    const index = Math.min(slots.length, MAX_TERRAIN_PAINT_LAYERS - 1);
    if (slots.length < MAX_TERRAIN_PAINT_LAYERS) slots.push(slotFor(surface, layer));
    slotIndex.set(key, index);
    return index;
  };
  const layerSlots = layers.map(layer => addSlot(`layer:${layer.id}`, layer.surface, layer));
  const surfaceSlot = (surface: string): number => {
    const index = layers.findIndex(layer => layer.surface === surface);
    return index >= 0 ? layerSlots[index]! : addSlot(`surface:${surface}`, surface, undefined);
  };

  const size = cols * rows * 4;
  const planes: [Uint8Array, Uint8Array] =
    into !== undefined && into.cols === cols && into.rows === rows ? into.planes : [new Uint8Array(size), new Uint8Array(size)];
  planes[0].fill(0);
  planes[1].fill(0);
  const cellW = (gridBounds.maxX - gridBounds.minX) / cols;
  const cellD = (gridBounds.maxZ - gridBounds.minZ) / rows;
  const accum = new Float32Array(MAX_TERRAIN_PAINT_LAYERS);
  for (let gz = 0; gz < rows; gz++) {
    const z = gridBounds.minZ + (gz + 0.5) * cellD;
    for (let gx = 0; gx < cols; gx++) {
      const x = gridBounds.minX + (gx + 0.5) * cellW;
      accum.fill(0);
      const weights = source.weightsAt(x, z);
      if (layers.length > 0 && weights.length === layers.length) {
        for (let i = 0; i < layers.length; i++) accum[layerSlots[i]!]! += weights[i]! * (layers[i]!.opacity ?? 1);
      } else {
        const surface = source.surfaceAt(x, z);
        if (surface === null) continue;
        const slot = surfaceSlot(surface);
        const layer = layers.find(candidate => candidate.surface === surface);
        accum[slot] = layer?.opacity ?? 1;
      }
      const cell = (gz * cols + gx) * 4;
      for (let i = 0; i < MAX_TERRAIN_PAINT_LAYERS; i++) {
        const value = Math.round(Math.min(1, Math.max(0, accum[i]!)) * 255);
        if (value === 0) continue;
        planes[i < 4 ? 0 : 1][cell + (i & 3)] = value;
      }
    }
  }
  return {
    cols,
    rows,
    bounds: { minX: gridBounds.minX, minZ: gridBounds.minZ, maxX: gridBounds.maxX, maxZ: gridBounds.maxZ },
    slots,
    planes,
  };
}

/** GPU-side paint coverage shared by the terrain surface material; `update` after each paint stroke. */
export interface TerrainPaintTextures {
  /** Shader uniforms (`uPaintA`, `uLayerColor`, …) to merge into the surface material. */
  readonly uniforms: Record<string, THREE.IUniform>;
  /** Bit `1 << classIndex` per surface class the current slots use; shaders compile only these responses. */
  readonly classMask: number;
  /** Re-upload coverage and layer slots; reallocates only when the cell grid size changes. */
  update(weights: TerrainPaintWeights): void;
  dispose(): void;
}

/** Edge warp, in cells: how far noise pushes a painted boundary off the cell grid. */
const PAINT_EDGE_WARP = 1.5;

function coverageTexture(data: Uint8Array, cols: number, rows: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Uploads packed paint coverage ({@link packTerrainPaintWeights}) as two linear-filtered RGBA
 * textures plus per-slot hue, surface class, roughness and pattern scale for the terrain surface material.
 */
export function createTerrainPaintTextures(weights: TerrainPaintWeights): TerrainPaintTextures {
  const colors = Array.from({ length: MAX_TERRAIN_PAINT_LAYERS }, () => new THREE.Color());
  const classes = new Float32Array(MAX_TERRAIN_PAINT_LAYERS);
  const roughness = new Float32Array(MAX_TERRAIN_PAINT_LAYERS);
  const scales = new Float32Array(MAX_TERRAIN_PAINT_LAYERS);
  const uniforms = {
    uPaintA: { value: coverageTexture(weights.planes[0], weights.cols, weights.rows) },
    uPaintB: { value: coverageTexture(weights.planes[1], weights.cols, weights.rows) },
    uPaintMin: { value: new THREE.Vector2() },
    uPaintCell: { value: new THREE.Vector2() },
    uPaintGrid: { value: new THREE.Vector2() },
    uPaintWarp: { value: PAINT_EDGE_WARP },
    uLayerColor: { value: colors },
    uLayerClass: { value: classes },
    uLayerRough: { value: roughness },
    uLayerScale: { value: scales },
  };
  let classMask = 0;
  const update = (next: TerrainPaintWeights): void => {
    classMask = next.slots.reduce((mask, slot) => mask | (1 << slot.classIndex), 0);
    for (const [key, plane] of [["uPaintA", next.planes[0]], ["uPaintB", next.planes[1]]] as const) {
      const current = uniforms[key].value;
      if (current.image.width === next.cols && current.image.height === next.rows) {
        if (current.image.data !== plane) (current.image.data as Uint8Array).set(plane);
        current.needsUpdate = true;
      } else {
        current.dispose();
        uniforms[key].value = coverageTexture(plane, next.cols, next.rows);
      }
    }
    const { bounds, cols, rows } = next;
    uniforms.uPaintMin.value.set(bounds.minX, bounds.minZ);
    uniforms.uPaintCell.value.set((bounds.maxX - bounds.minX) / cols, (bounds.maxZ - bounds.minZ) / rows);
    uniforms.uPaintGrid.value.set(cols, rows);
    for (let i = 0; i < MAX_TERRAIN_PAINT_LAYERS; i++) {
      const slot = next.slots[i];
      colors[i]!.copy(slot?.color ?? colors[i]!);
      classes[i] = slot?.classIndex ?? 0;
      roughness[i] = slot?.roughness ?? 0.9;
      scales[i] = slot?.scale ?? 1;
    }
  };
  update(weights);
  return {
    uniforms,
    get classMask() {
      return classMask;
    },
    update,
    dispose: () => {
      uniforms.uPaintA.value.dispose();
      uniforms.uPaintB.value.dispose();
    },
  };
}
