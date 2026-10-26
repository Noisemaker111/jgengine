import * as THREE from "three";

/** Options for {@link buildGroundCoverageMask}. */
export interface GroundCoverageOptions {
  /** Metres inside the outer edge over which ground goes from clear to opaque. */
  width: number;
  /** Gaps between layers narrower than twice this (metres) count as inside, not as an outer edge. Default 1.5. */
  closeRadius?: number;
  /** Finest cell size in metres. Default 0.5. */
  cell?: number;
  /** Upper bound on cells per axis; large districts get coarser cells. Default 640. */
  maxCells?: number;
}

/**
 * How far each point of a merged ground footprint lies inside its outer edge, as a grid over world
 * XZ: `data[row * columns + column]` is 0 on or outside the edge and 255 at `width` metres or more
 * inside. Cell centres sit at `origin + (index + 0.5) * cell`.
 */
export interface GroundCoverageMask {
  data: Uint8Array;
  columns: number;
  rows: number;
  originX: number;
  originZ: number;
  cell: number;
}

const DIAGONAL = Math.SQRT2;

/** Two-pass chamfer distance (in cells) from every cell to the nearest seed cell. */
function chamfer(seed: Uint8Array, columns: number, rows: number): Float32Array {
  const d = new Float32Array(columns * rows);
  for (let i = 0; i < d.length; i += 1) d[i] = seed[i] === 1 ? 0 : Infinity;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const k = j * columns + i;
      let best = d[k]!;
      if (i > 0) best = Math.min(best, d[k - 1]! + 1);
      if (j > 0) {
        best = Math.min(best, d[k - columns]! + 1);
        if (i > 0) best = Math.min(best, d[k - columns - 1]! + DIAGONAL);
        if (i + 1 < columns) best = Math.min(best, d[k - columns + 1]! + DIAGONAL);
      }
      d[k] = best;
    }
  }
  for (let j = rows - 1; j >= 0; j -= 1) {
    for (let i = columns - 1; i >= 0; i -= 1) {
      const k = j * columns + i;
      let best = d[k]!;
      if (i + 1 < columns) best = Math.min(best, d[k + 1]! + 1);
      if (j + 1 < rows) {
        best = Math.min(best, d[k + columns]! + 1);
        if (i + 1 < columns) best = Math.min(best, d[k + columns + 1]! + DIAGONAL);
        if (i > 0) best = Math.min(best, d[k + columns - 1]! + DIAGONAL);
      }
      d[k] = best;
    }
  }
  return d;
}

/**
 * Rasterize the XZ footprint of ground meshes (roads, block land, parks…) into a
 * {@link GroundCoverageMask}. Small gaps between layers are closed first, so only the merged
 * footprint's outer edge fades: seams between layers inside it keep their full opacity. Vertical
 * faces (curbs) add nothing. Returns `null` when the meshes cover nothing.
 * @capability ground-edge-fade fade merged ground layers into the terrain at their outer edge, keeping inner seams crisp
 */
export function buildGroundCoverageMask(
  geometries: readonly (THREE.BufferGeometry | null | undefined)[],
  options: GroundCoverageOptions,
): GroundCoverageMask | null {
  const width = Math.max(1e-3, options.width);
  const closeRadius = Math.max(0, options.closeRadius ?? 1.5);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const geometry of geometries) {
    const position = geometry?.getAttribute("position");
    if (position === undefined) continue;
    for (let v = 0; v < position.count; v += 1) {
      const x = position.getX(v);
      const z = position.getZ(v);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX)) return null;
  const maxCells = Math.max(8, Math.floor(options.maxCells ?? 640));
  const pad = closeRadius + 2;
  const spanX = maxX - minX + pad * 2;
  const spanZ = maxZ - minZ + pad * 2;
  const cell = Math.max(options.cell ?? 0.5, spanX / maxCells, spanZ / maxCells);
  const columns = Math.max(2, Math.ceil(spanX / cell));
  const rows = Math.max(2, Math.ceil(spanZ / cell));
  const originX = minX - pad;
  const originZ = minZ - pad;

  const covered = new Uint8Array(columns * rows);
  let any = false;
  for (const geometry of geometries) {
    const position = geometry?.getAttribute("position");
    if (geometry == null || position === undefined) continue;
    const index = geometry.getIndex();
    const count = index === null ? position.count : index.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const a = index === null ? t : index.getX(t);
      const b = index === null ? t + 1 : index.getX(t + 1);
      const c = index === null ? t + 2 : index.getX(t + 2);
      const ax = position.getX(a);
      const az = position.getZ(a);
      const bx = position.getX(b);
      const bz = position.getZ(b);
      const cx = position.getX(c);
      const cz = position.getZ(c);
      const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (Math.abs(area) < 1e-6) continue;
      const sign = area > 0 ? 1 : -1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - originX) / cell - 0.5));
      const i1 = Math.min(columns - 1, Math.ceil((Math.max(ax, bx, cx) - originX) / cell - 0.5));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - originZ) / cell - 0.5));
      const j1 = Math.min(rows - 1, Math.ceil((Math.max(az, bz, cz) - originZ) / cell - 0.5));
      for (let j = j0; j <= j1; j += 1) {
        const pz = originZ + (j + 0.5) * cell;
        for (let i = i0; i <= i1; i += 1) {
          const px = originX + (i + 0.5) * cell;
          const e0 = ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) * sign;
          const e1 = ((cx - bx) * (pz - bz) - (cz - bz) * (px - bx)) * sign;
          const e2 = ((ax - cx) * (pz - cz) - (az - cz) * (px - cx)) * sign;
          if (e0 >= 0 && e1 >= 0 && e2 >= 0) {
            covered[j * columns + i] = 1;
            any = true;
          }
        }
      }
    }
  }
  if (!any) return null;

  // Morphological closing: grow the footprint by `closeRadius`, then measure inward from the grown
  // edge less that radius, so a narrow gap between two layers never reads as an outer edge.
  const toCovered = chamfer(covered, columns, rows);
  const outsideGrown = new Uint8Array(columns * rows);
  for (let k = 0; k < outsideGrown.length; k += 1) outsideGrown[k] = toCovered[k]! * cell > closeRadius ? 1 : 0;
  const toOutside = chamfer(outsideGrown, columns, rows);
  const data = new Uint8Array(columns * rows);
  for (let k = 0; k < data.length; k += 1) {
    // Centre-to-centre distance overshoots the edge between two cells by half a cell.
    const inside = (toOutside[k]! - 0.5) * cell - closeRadius;
    data[k] = Math.round(Math.max(0, Math.min(1, inside / width)) * 255);
  }
  return { data, columns, rows, originX, originZ, cell };
}

/** Shared uniforms for {@link applyGroundEdgeFade}; `setMask` retargets every material using them without a recompile. */
export interface GroundEdgeFade {
  readonly uniforms: {
    uJgFadeMask: { value: THREE.Texture };
    /** `(originX, originZ, columns * cell, rows * cell)`. */
    uJgFadeBounds: { value: THREE.Vector4 };
    /** Mask width in metres; scales the noise that breaks up the edge. */
    uJgFadeWidth: { value: number };
  };
  /** Swap in a new mask (`null` = fully opaque everywhere). The previous texture is disposed. */
  setMask(mask: GroundCoverageMask | null, width: number): void;
  dispose(): void;
}

function opaqueTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Uniforms for one faded footprint, shared by every ground material of one district. Starts fully opaque.
 * @capability ground-edge-fade fade merged ground layers into the terrain at their outer edge, keeping inner seams crisp
 */
export function createGroundEdgeFade(): GroundEdgeFade {
  const uniforms = {
    uJgFadeMask: { value: opaqueTexture() as THREE.Texture },
    uJgFadeBounds: { value: new THREE.Vector4(-1e6, -1e6, 2e6, 2e6) },
    uJgFadeWidth: { value: 1 },
  };
  return {
    uniforms,
    setMask(mask, width) {
      uniforms.uJgFadeMask.value.dispose();
      if (mask === null) {
        uniforms.uJgFadeMask.value = opaqueTexture();
        uniforms.uJgFadeBounds.value.set(-1e6, -1e6, 2e6, 2e6);
      } else {
        const texture = new THREE.DataTexture(mask.data, mask.columns, mask.rows, THREE.RedFormat);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        // One byte per texel: rows are not 4-byte aligned unless `columns` happens to be.
        texture.unpackAlignment = 1;
        texture.needsUpdate = true;
        uniforms.uJgFadeMask.value = texture;
        uniforms.uJgFadeBounds.value.set(mask.originX, mask.originZ, mask.columns * mask.cell, mask.rows * mask.cell);
      }
      uniforms.uJgFadeWidth.value = Math.max(1e-3, width);
    },
    dispose() {
      uniforms.uJgFadeMask.value.dispose();
    },
  };
}

const FADE_FRAGMENT_GLSL = /* glsl */ `
{
  float jgFadeIn = texture2D(uJgFadeMask, (vJgFadePos - uJgFadeBounds.xy) / uJgFadeBounds.zw).r;
  // Two octaves of value noise keep the edge from reading as a traced outline.
  float jgFadeN = jgFadeNoise(vJgFadePos / max(0.6, uJgFadeWidth * 1.2)) * 0.7 + jgFadeNoise(vJgFadePos / max(0.25, uJgFadeWidth * 0.3) + 17.3) * 0.3 - 0.5;
  diffuseColor.a *= smoothstep(0.0, 1.0, (jgFadeIn - 0.15 + jgFadeN * 0.35) / 0.7);
}
`;

const FADE_NOISE_GLSL = /* glsl */ `
float jgFadeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float jgFadeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(jgFadeHash(i), jgFadeHash(i + vec2(1.0, 0.0)), u.x), mix(jgFadeHash(i + vec2(0.0, 1.0)), jgFadeHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/**
 * Fade a ground material out at the outer edge of a {@link GroundCoverageMask}: clear on the edge,
 * opaque `width` metres inside, with a noise-broken line. Seams between layers inside the
 * footprint are untouched, so a district keeps crisp road/plaza edges while its outer boundary
 * melts into the terrain. Turns on blending (depth writes stay on); give stacked layers ascending
 * `renderOrder` so lower ones draw first. Chains any existing `onBeforeCompile`, so it composes
 * with `createSurfaceRibbonMaterial` and plain `MeshStandardMaterial`s alike.
 * @capability ground-edge-fade fade merged ground layers into the terrain at their outer edge, keeping inner seams crisp
 */
export function applyGroundEdgeFade<M extends THREE.Material>(material: M, fade: GroundEdgeFade): M {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.transparent = true;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, fade.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vJgFadePos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvJgFadePos = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vJgFadePos;
uniform sampler2D uJgFadeMask;
uniform vec4 uJgFadeBounds;
uniform float uJgFadeWidth;
${FADE_NOISE_GLSL}`,
      )
      .replace("#include <alphamap_fragment>", `#include <alphamap_fragment>\n${FADE_FRAGMENT_GLSL}`);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-jgedgefade`;
  material.needsUpdate = true;
  return material;
}
