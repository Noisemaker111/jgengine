/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { runGenerator, type GeneratorDefinition, type GeneratorVariant } from "@jgengine/core/generator/generator";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { LANDFORM_OUTPUT } from "./landformGenerator";
import type { LandformSurfaceKind } from "../materials/landformSurface";
import type { LandformTerrain } from "./landformTerrain";

/** Tile colour per surface kind, blended by the landform's weights. */
const KIND_COLORS: Readonly<Record<LandformSurfaceKind, string>> = { rock: "#7d7a76", gravel: "#9a8f7e", sand: "#d8c08a", mud: "#6b5a44", soil: "#5d7a3a" };
const WATER = new THREE.Color("#3f6f96");

function isLandformTerrain(value: unknown): value is LandformTerrain {
  return typeof value === "object" && value !== null && "heights" in value && value.heights instanceof Float32Array && "cols" in value && "rows" in value;
}

/** A tile grows its variant at the generator's coarsest detail, so twenty tiles stay quick. */
function previewTerrain(definition: GeneratorDefinition, variant: GeneratorVariant): LandformTerrain | null {
  const detail = Math.min(1, ...(definition.lods ?? [1]));
  const output = runGenerator(definition, variant.meta, { detail });
  return isLandformTerrain(output) ? output : null;
}

function heightRange(terrain: LandformTerrain): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const h of terrain.heights) {
    low = Math.min(low, h);
    high = Math.max(high, h);
  }
  return { low: Number.isFinite(low) ? low : 0, high: Number.isFinite(high) ? high : 0 };
}

/**
 * The landform as a lit, vertex-coloured heightfield centred on the origin with its lowest ground at
 * 0, water cells tinted blue.
 * @internal
 */
export function landformPreviewGeometry(terrain: LandformTerrain): THREE.BufferGeometry {
  const { cols, rows, cellSize, heights, kinds, weights, waterDepth } = terrain;
  const { low } = heightRange(terrain);
  const geometry = new THREE.PlaneGeometry((cols - 1) * cellSize, (rows - 1) * cellSize, cols - 1, rows - 1);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(cols * rows * 3);
  const mix = new THREE.Color();
  const tint = new THREE.Color();
  const k = kinds.length;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = row * cols + col;
      position.setY(cell, (heights[cell] ?? 0) - low);
      mix.setRGB(0, 0, 0);
      kinds.forEach((kind, index) => mix.add(tint.set(KIND_COLORS[kind]).multiplyScalar(weights[cell * k + index] ?? 0)));
      if ((waterDepth[cell] ?? 0) > 0) mix.lerp(WATER, 0.8);
      colors.set([mix.r, mix.g, mix.b], cell * 3);
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** @internal */
export function landformPreviewDraw({ definition, variant }: GeneratorPreviewProps): EngineDraw {
  const terrain = previewTerrain(definition, variant);
  const geometry = terrain === null ? null : landformPreviewGeometry(terrain);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const mesh = geometry === null ? null : new THREE.Mesh(geometry, material);
  return {
    mount(state: EngineFrameState) {
      if (mesh !== null) state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) state.scene.remove(mesh);
      geometry?.dispose();
      material.dispose();
    },
  };
}

function LandformPreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => landformPreviewDraw(latest.current), [definition, variant]);
  return null;
}

/** Registers the landform variant-tile preview: the grown ground as a coloured relief. Loaded on demand. @internal */
export function registerLandformPreview(): void {
  registerGeneratorPreview(LANDFORM_OUTPUT, {
    Component: LandformPreview,
    frame: ({ definition, variant }) => {
      const terrain = previewTerrain(definition, variant);
      if (terrain === null) return { target: [0, 0, 0], distance: 100 };
      const extent = Math.max(terrain.cols, terrain.rows) * terrain.cellSize;
      const { low, high } = heightRange(terrain);
      return { target: [0, (high - low) * 0.3, 0], distance: extent * 1.1 };
    },
  });
}
