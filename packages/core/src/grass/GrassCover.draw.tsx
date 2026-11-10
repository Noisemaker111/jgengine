/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { createGrassCoverGeometry, GRASS_COVER_MAX_SEGMENTS } from "./grassCoverGeometry.draw";
import type { TerrainHeightSampler } from "@jgengine/core/terrain/terrainMath.draw";

interface CoverGrain {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  /** Mean of the colour map, 0..1: what the grain flattens to as `grain` falls to 0. */
  mean: number;
}

let grain: CoverGrain | null = null;

/** Texels per side of the grain tile; it spans `GRASS_COVER_TILE_METRES`, so a texel is about a centimetre. */
const GRAIN_SIZE = 256;

function grainHash(x: number, y: number): number {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function grainTexture(data: Uint8Array): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, GRAIN_SIZE, GRAIN_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tileable turf grain for the cover mat, generated once from a hash with no asset pull: thousands
 * of short centimetre blade strokes over darker gaps, as a colour map (luminance around 0.9) and a
 * matching normal map. Up close a short-cut mat reads as blades, and mipmaps calm it with distance.
 */
function coverGrain(): CoverGrain {
  if (grain !== null) return grain;
  const size = GRAIN_SIZE;
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i += 1) height[i] = grainHash(i % size, Math.floor(i / size)) * 0.25;
  const strokes = size * size * 0.2;
  for (let n = 0; n < strokes; n += 1) {
    const x0 = grainHash(n, 11) * size;
    const y0 = grainHash(n, 23) * size;
    const angle = grainHash(n, 37) * Math.PI * 2;
    const length = 1.5 + grainHash(n, 41) * 2.5;
    const peak = 0.55 + grainHash(n, 53) * 0.45;
    for (let t = 0; t <= length; t += 0.5) {
      const x = ((Math.round(x0 + Math.cos(angle) * t) % size) + size) % size;
      const y = ((Math.round(y0 + Math.sin(angle) * t) % size) + size) % size;
      const i = y * size + x;
      height[i] = Math.max(height[i] ?? 0, peak * (0.6 + 0.4 * (t / length)));
    }
  }
  const at = (x: number, y: number) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;
  const colour = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  let total = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const clump = (grainHash(x >> 3, y >> 3) - 0.5) * 18;
      const value = Math.max(170, Math.min(255, Math.round(192 + at(x, y) * 72 + clump)));
      total += value;
      colour[i] = value;
      colour[i + 1] = value;
      colour[i + 2] = value;
      colour[i + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 1.4;
      const length = Math.hypot(dx, dy, 1);
      normal[i] = Math.round((-dx / length) * 127.5 + 127.5);
      normal[i + 1] = Math.round((-dy / length) * 127.5 + 127.5);
      normal[i + 2] = Math.round((1 / length) * 127.5 + 127.5);
      normal[i + 3] = 255;
    }
  }
  const normalMap = grainTexture(normal);
  normalMap.repeat.set(2, 2);
  grain = { map: grainTexture(colour), normalMap, mean: total / (size * size * 255) };
  return grain;
}

/**
 * How a style's `detail` draws the mat's grain: `strength` scales the blade strokes' contrast (0 a
 * flat painted colour, 1 the grain as generated, up to 1.6) and `scale` how finely they repeat (1,
 * up to 2 at full detail). Detail 0.5 is the grain as it always was.
 * @internal
 */
export function grassCoverGrain(detail: number): { strength: number; scale: number } {
  const d = Math.max(0, Math.min(1, detail));
  return { strength: Math.min(1.6, d * 2), scale: d > 0.5 ? 1 + (d - 0.5) * 2 : 1 };
}

/**
 * The mat's map lookup with the grain's strength and scale applied: three's `map_fragment` sampling at
 * `vMapUv * uGrainScale` and mixing the sample toward the grain's mean by `uGrain`.
 * @internal
 */
export function grassCoverMapFragment(chunk: string): string {
  const sample = "texture2D( map, vMapUv )";
  const apply = "diffuseColor *= sampledDiffuseColor;";
  if (!chunk.includes(sample) || !chunk.includes(apply)) throw new Error("GrassCover: three's map_fragment changed; update grassCoverMapFragment");
  return chunk
    .replace(sample, "texture2D( map, vMapUv * uGrainScale )")
    .replace(apply, `sampledDiffuseColor.rgb = mix( vec3( uGrainMean ), sampledDiffuseColor.rgb, uGrain );\n\t${apply}`);
}

/** Props for {@link GrassCover}: one authored patch's footprint, colours and drape samplers. */
export interface GrassCoverProps {
  area: readonly [number, number];
  seed: number;
  colorBase: THREE.ColorRepresentation;
  colorTip: THREE.ColorRepresentation;
  strength: number;
  edgeFeather: number;
  heightAt: TerrainHeightSampler;
  /** 0..1 mat coverage at a point, given the ground height there. */
  coverageAt: (x: number, z: number, height: number) => number;
  segments?: number;
  /** Metres the mat floats above the ground; keep it under the blade height or the mat hides the blades. Default 0.035. */
  lift?: number;
  /** Patch-local mat shade, about -1..1 (mow stripes, cushion mounds); omit for an even mat. */
  shadeAt?: TerrainHeightSampler | undefined;
  /** The style's `detail`, 0..1, which sets the grain ({@link grassCoverGrain}). Default 0.5. */
  detail?: number;
  position?: readonly [number, number, number];
}

/**
 * The turf surface under one authored `grass_field` patch: a ground-draped, edge-feathered mat that
 * turns a bare pavement footprint into grass the blade field stands in. Bounded to one draw and a
 * {@link GRASS_COVER_MAX_SEGMENTS}² grid, so a large park still costs a single mesh.
 */
export function grassCoverDraw(getProps: () => GrassCoverProps): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      if (props.strength <= 0) return;
      const baked = createGrassCoverGeometry({
        area: props.area,
        seed: props.seed,
        colorBase: props.colorBase,
        colorTip: props.colorTip,
        strength: props.strength,
        edgeFeather: props.edgeFeather,
        heightAt: props.heightAt,
        coverageAt: props.coverageAt,
        ...(props.segments === undefined ? {} : { segments: props.segments }),
        ...(props.lift === undefined ? {} : { lift: props.lift }),
        ...(props.shadeAt === undefined ? {} : { shadeAt: props.shadeAt }),
      });
      geometry = new THREE.BufferGeometry();
      if (baked.positions.length !== 0) {
        geometry.setAttribute("position", new THREE.BufferAttribute(baked.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(baked.normals, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(baked.colors, 4));
        geometry.setAttribute("uv", new THREE.BufferAttribute(baked.uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(baked.indices, 1));
        geometry.computeBoundingSphere();
      }
      const tile = coverGrain();
      const { strength, scale } = grassCoverGrain(props.detail ?? 0.5);
      material = new THREE.MeshStandardMaterial({
        map: tile.map,
        normalMap: tile.normalMap,
        normalScale: new THREE.Vector2(0.5 * strength, 0.5 * strength),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        roughness: 0.96,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms["uGrain"] = { value: strength };
        shader.uniforms["uGrainScale"] = { value: scale };
        shader.uniforms["uGrainMean"] = { value: tile.mean };
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uGrain;\nuniform float uGrainScale;\nuniform float uGrainMean;")
          .replace("#include <map_fragment>", grassCoverMapFragment(THREE.ShaderChunk.map_fragment));
      };
      material.customProgramCacheKey = () => "jgengine-grass-cover";
      mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      const position = props.position;
      if (position !== undefined) mesh.position.set(position[0], position[1], position[2]);
      state.scene.add(mesh);
    },
    frame() {
      const position = getProps().position;
      if (mesh !== null && position !== undefined) mesh.position.set(position[0], position[1], position[2]);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) state.scene.remove(mesh);
      mesh = null;
      geometry?.dispose();
      material?.dispose();
      geometry = null;
      material = null;
    },
  };
}

/**
 * The turf surface under one authored `grass_field` patch: a ground-draped, edge-feathered mat that
 * turns a bare pavement footprint into grass the blade field stands in. Bounded to one draw and a
 * {@link GRASS_COVER_MAX_SEGMENTS}² grid, so a large park still costs a single mesh.
 */
export function GrassCover(props: GrassCoverProps) {
  const latest = useRef<GrassCoverProps>(props);
  latest.current = props;
  useEngineDraw(() => grassCoverDraw(() => latest.current), [
    props.area,
    props.seed,
    props.colorBase,
    props.colorTip,
    props.strength,
    props.edgeFeather,
    props.heightAt,
    props.coverageAt,
    props.segments,
    props.lift,
    props.shadeAt,
    props.detail,
  ]);
  return null;
}
