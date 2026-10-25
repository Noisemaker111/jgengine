import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

import { SURFACE_SCAN_PARS_GLSL, surfaceScanDefines, surfaceScanKeyPart, surfaceScanUniforms, type SurfaceScanBlend } from "../render/surfaceScanShader";
import type { SurfaceScanTextures } from "../render/surfaceScanTextures";
import { NOISE_GLSL, SURFACE_BUMP_NORMAL_GLSL, SURFACE_FUNCTIONS_GLSL } from "./terrainSurfaceShader";
import { terrainSurfaceClass, terrainSurfaceClassIndex, terrainSurfaceRoughness, type TerrainSurfaceClass } from "./terrainSurfaces";

/** Vertex attribute {@link ribbonSurfaceFrame} fills: metres along the ribbon, signed metres across it, metres to its far end. */
export const RIBBON_FRAME_ATTRIBUTE = "jgRibbon";

/** How a ground ribbon (path, road, sidewalk) shades: procedural surface, edge blend and wear. */
export interface RibbonSurfaceStyle {
  /** Surface id classified like terrain paint (`"dirt"`, `"gravel"`, `"asphalt"`, …). */
  surface: string;
  /** Width of the edge fade in metres, centred on the authored edge. 0 keeps a hard opaque edge. */
  feather: number;
  /** How far noise pushes the edge in or out, in metres. */
  warp: number;
  /** Wheel ruts on soft ground, polished tyre lanes on pavement, 0..1. */
  wear: number;
}

/** Options for {@link createSurfaceRibbonMaterial}. */
export interface SurfaceRibbonMaterialOptions extends Partial<RibbonSurfaceStyle> {
  /** Authored hue; the procedural surface varies around it. */
  color: string;
  /** Authored half width in metres; the edge fade is centred on it. */
  halfWidth: number;
  /** Override the surface class's default roughness. */
  roughness?: number;
  /** Pattern frequency multiplier. Default 1. */
  scale?: number;
  /** Graphics tier, from `useTerrainQuality()`. `low` drops micro-normals and fine octaves. Default `high`. */
  quality?: GraphicsQuality;
  /** Pull the ribbon toward the camera in depth so it wins over a coplanar layer beneath. */
  polygonOffset?: boolean;
  /** Multiply by the geometry's `color` attribute, as city ground meshes carry per-vertex tints. */
  vertexColors?: boolean;
  /**
   * Paving slabs `[along, across]` in metres, laid on the ribbon frame so joints run square to the
   * kerb: each slab takes its own tone and the joints darken and dip. Omit for none.
   */
  slabs?: readonly [number, number];
  /** A loaded scanned surface layered under the procedural wear; see {@link RibbonSurfaceScan}. */
  scan?: RibbonSurfaceScan;
  /**
   * Road paint (lane dashes, stop lines): blends over the surface below and wears through in
   * tyre-polished patches and flakes, so a marking reads as paint on asphalt, not a plastic strip.
   */
  paint?: boolean;
}

/** A scanned surface on a ribbon: maps, blend, and whether it tiles in world XZ or along the ribbon. */
export interface RibbonSurfaceScan extends SurfaceScanBlend {
  textures: SurfaceScanTextures;
  /**
   * `"world"` tiles in world XZ, so a carriageway and its welded junctions meet without a seam, with a
   * second rotated sample breaking up the repeat; `"frame"` tiles along/across the ribbon, so slabs
   * and setts square up with the kerb. Default `"world"`.
   */
  projection?: "world" | "frame";
}

const SOFT_GROUND: ReadonlySet<TerrainSurfaceClass> = new Set(["dirt", "mud", "sand", "gravel", "grass", "ground", "snow"]);

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Default ribbon look for an authored path: the surface comes from `meta.surface`, else the path
 * kind (`"road"` paves, `"gravel-track"` gravels), else dirt. Soft ground gets a noise-warped edge
 * that fades into the terrain and wheel ruts; pavement keeps a near-hard edge and faint tyre lanes.
 * `meta.surfaceDetail: false` (or `meta.surface: false`) returns `null` for the old flat ribbon;
 * `meta.edgeSoftness` scales the fade (0 = hard) and `meta.wear` sets wear 0..1.
 */
export function resolvePathSurface(
  kind: string,
  width: number,
  meta: Readonly<Record<string, unknown>> | undefined,
): RibbonSurfaceStyle | null {
  if (meta?.["surfaceDetail"] === false || meta?.["surface"] === false) return null;
  const id = typeof meta?.["surface"] === "string" ? (meta["surface"] as string) : kind;
  const classified = terrainSurfaceClass(id);
  const cls: TerrainSurfaceClass = classified === "ground" ? "dirt" : classified;
  const surface = classified === "ground" ? "dirt" : id;
  const soft = SOFT_GROUND.has(cls);
  const softness = typeof meta?.["edgeSoftness"] === "number" ? Math.max(0, meta["edgeSoftness"] as number) : 1;
  const feather = (soft ? clamp(width * 0.18, 0.35, 1.6) : clamp(width * 0.04, 0.08, 0.3)) * softness;
  const warp = (soft ? clamp(width * 0.08, 0.15, 0.6) : 0.03) * softness;
  const wear = typeof meta?.["wear"] === "number" ? clamp(meta["wear"] as number, 0, 1) : soft ? 1 : 0.6;
  return { surface, feather, warp, wear };
}

/** Extra ribbon width (metres, both sides together) a style needs so its fade straddles the authored edge. */
export function ribbonEdgeMargin(style: Pick<RibbonSurfaceStyle, "feather" | "warp">): number {
  return style.feather + style.warp * 2;
}

/**
 * Per-vertex `(along, across, toEnd)` for a ribbon in `buildRoadRibbon`'s layout (left/right vertex
 * pairs down the centreline). Pass several ribbons' position arrays to get one concatenated frame
 * for a merged mesh; each ribbon's distances restart at its own start.
 */
export function ribbonSurfaceFrame(ribbons: readonly Float32Array[]): Float32Array {
  const total = ribbons.reduce((sum, positions) => sum + positions.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of ribbons) {
    const pairs = Math.floor(p.length / 6);
    let along = 0;
    let px = 0;
    let pz = 0;
    for (let i = 0; i < pairs; i++) {
      const b = i * 6;
      const cx = (p[b]! + p[b + 3]!) / 2;
      const cz = (p[b + 2]! + p[b + 5]!) / 2;
      if (i > 0) along += Math.hypot(cx - px, cz - pz);
      px = cx;
      pz = cz;
      const half = Math.hypot(p[b]! - p[b + 3]!, p[b + 2]! - p[b + 5]!) / 2;
      out[offset + b] = along;
      out[offset + b + 1] = half;
      out[offset + b + 3] = along;
      out[offset + b + 4] = -half;
    }
    for (let i = 0; i < pairs; i++) {
      const b = offset + i * 6;
      out[b + 2] = along - out[b]!;
      out[b + 5] = along - out[b + 3]!;
    }
    offset += p.length;
  }
  return out;
}

const RIBBON_FRAGMENT_GLSL = /* glsl */ `
vec2 jgWp = vJgWorldPos.xz;
jgFootprint = max(length(dFdx(vJgWorldPos)), length(dFdy(vJgWorldPos)));
JgSurf jgS = jgSurface(JG_RIBBON_CLASS, diffuseColor.rgb, uJgRough, uJgScale, vJgWorldPos);
vec3 jgCol = jgS.albedo;
float jgRough = jgS.rough;
float jgBumpH = jgS.bump;
float jgAcross = vJgRibbon.y;
#ifdef JG_SCAN
#ifdef JG_SCAN_FRAME
vec2 jgScanUvA = vec2(vJgRibbon.x, vJgRibbon.y + uJgHalfWidth) / uScanRepeat;
#define JG_SCAN_SAMPLE(tex) texture2D(tex, jgScanUvA)
#else
// Two samples of the same scan, the second rotated and shifted, blended by low-frequency noise so
// a long carriageway never shows the tile repeating.
vec2 jgScanUvA = jgWp / uScanRepeat;
vec2 jgScanUvB = mat2(0.8, -0.6, 0.6, 0.8) * jgScanUvA + vec2(0.37, 0.71);
float jgScanW = smoothstep(0.3, 0.7, jgVNoise(jgWp / 9.0 + 4.2));
#define JG_SCAN_SAMPLE(tex) mix(texture2D(tex, jgScanUvA), texture2D(tex, jgScanUvB), jgScanW)
#endif
jgCol = jgScanAlbedo(diffuseColor.rgb, JG_SCAN_SAMPLE(uScanColor).rgb);
jgBumpH *= 1.0 - 0.75 * uScanStrength;
#ifdef JG_SCAN_ROUGH
jgRough = uJgRough + (JG_SCAN_SAMPLE(uScanRough).g - jgScanRoughMean()) * uScanStrength * 0.8;
#else
jgRough = uJgRough;
#endif
#endif
jgCol *= 1.0 + (jgFbm2(jgWp / 14.0 + vec2(3.7, 61.2)) - 0.5) * 0.24;
#if defined(JG_RIBBON_PAVED) && !defined(JG_SURFACE_LOW)
{
  // Weathered pavement: resurfaced patches, then (procedural only) exposed aggregate and a sparse,
  // hairline crack network that wanders instead of tracing a cell grid.
  jgCol *= 1.0 + (jgFbm3o(jgWp / 5.0 + 11.0) - 0.5) * 0.3;
#ifndef JG_SCAN
  jgCol *= 1.0 + (jgVNoise(jgWp * 16.0) - 0.5) * 0.26 * jgBand(16.0);
#ifndef JG_RIBBON_SLABS
  vec2 jgCw = jgWp * 0.22 + (vec2(jgVNoise(jgWp * 0.7 + 1.3), jgVNoise(jgWp * 0.7 + 8.1)) - 0.5) * 0.45;
  vec3 jgCell = jgVoronoi(jgCw + 5.1);
  float jgCrack = (1.0 - smoothstep(0.0, 0.007, jgCell.y)) * smoothstep(0.6, 0.74, jgVNoise(jgWp * 0.21 + 3.3)) * jgBand(3.0);
  jgCol *= 1.0 - 0.32 * jgCrack;
  jgRough += 0.05 * jgCrack;
  jgBumpH -= jgCrack * 0.003;
#endif
#endif
}
#endif
#ifdef JG_RIBBON_SLABS
{
  // Slabs on the ribbon frame: joints square to the kerb, one tone per slab, joints fading out
  // before a pixel spans them so distance never shimmers.
  vec2 jgSl = vec2(vJgRibbon.x, vJgRibbon.y + uJgHalfWidth) / uJgSlab;
  vec2 jgSlCell = floor(jgSl);
  vec2 jgSlF = abs(fract(jgSl) - 0.5) * 2.0;
  vec2 jgSlD = (1.0 - jgSlF) * 0.5 * uJgSlab;
  float jgJointD = min(jgSlD.x, jgSlD.y);
  float jgJoint = (1.0 - smoothstep(0.004, 0.012 + jgFootprint * 0.5, jgJointD)) * (1.0 - smoothstep(0.03, 0.09, jgFootprint));
  float jgSlTone = jgHash(jgSlCell + vec2(17.0, 3.0));
  jgCol *= 0.93 + 0.14 * jgSlTone;
  jgRough += (jgSlTone - 0.5) * 0.06;
  jgCol *= 1.0 - 0.38 * jgJoint;
  jgRough += 0.06 * jgJoint;
  jgBumpH -= jgJoint * 0.004;
}
#endif
#ifdef JG_RIBBON_WEAR
{
  // Two wheel tracks a cart-axle apart, wandering together along the ribbon.
  float jgWob = (jgVNoise(vec2(vJgRibbon.x * 0.09, 4.7)) - 0.5) * uJgHalfWidth * 0.35;
  float jgRutD = abs(abs(jgAcross - jgWob) - uJgHalfWidth * 0.45);
  float jgRutW = max(0.15, uJgHalfWidth * 0.14);
  float jgRut = exp(-(jgRutD * jgRutD) / (jgRutW * jgRutW)) * (0.55 + 0.45 * jgVNoise(vec2(vJgRibbon.x * 0.4, 9.1))) * uJgWear;
#ifdef JG_RIBBON_PAVED
  jgCol *= 1.0 - 0.22 * jgRut;
  jgRough -= 0.16 * jgRut;
#else
  // Trodden band: packed flat, fewer loose grains and a little dustier, so the track reads against
  // painted dirt of the same hue; then darker ruts and loose soil heaped toward the shoulders.
  float jgTrod = (1.0 - smoothstep(uJgHalfWidth * 0.5, uJgHalfWidth * 0.95, abs(jgAcross))) * uJgWear;
  jgCol = mix(jgCol, diffuseColor.rgb * (0.96 + 0.12 * jgFbm2(jgWp * 0.7 + 2.9)), 0.5 * jgTrod);
  jgCol *= 1.0 + 0.08 * jgTrod;
  jgBumpH *= 1.0 - 0.6 * jgTrod;
  jgCol *= 1.0 - 0.32 * jgRut;
  jgRough -= 0.12 * jgRut;
  jgBumpH -= jgRut * 0.03;
  float jgShoulder = smoothstep(uJgHalfWidth * 0.6, uJgHalfWidth, abs(jgAcross)) * uJgWear;
  jgCol *= 1.0 - 0.16 * jgShoulder;
  jgBumpH += jgShoulder * 0.014;
#endif
}
#endif
#ifdef JG_RIBBON_EDGE
{
  float jgEdgeN = (jgFbm2(jgWp * 0.55 + 7.3) - 0.5) * 2.0 + (jgVNoise(jgWp * 2.3 + 1.7) - 0.5) * 0.6;
  float jgEdge = uJgHalfWidth + jgEdgeN * uJgWarp;
  float jgAlpha = 1.0 - smoothstep(jgEdge - uJgFeather * 0.5, jgEdge + uJgFeather * 0.5, abs(jgAcross));
  jgAlpha *= smoothstep(0.0, uJgFeather, min(vJgRibbon.x, vJgRibbon.z) + jgEdgeN * uJgWarp);
  // Taller grains (pebbles, clods) hold on longer, so the edge breaks up instead of fading evenly.
  jgAlpha = clamp(jgAlpha + (jgS.height - 0.4) * 2.4 * jgAlpha * (1.0 - jgAlpha), 0.0, 1.0);
  diffuseColor.a *= jgAlpha;
  jgBumpH *= jgAlpha;
}
#endif
#ifdef JG_RIBBON_PAINT
{
  // Worn paint: broad polished patches plus fine flaking let the surface beneath show through.
  float jgPaintWear = smoothstep(0.45, 0.85, jgFbm2(jgWp * 1.7 + 13.1)) * 0.6 + (jgVNoise(jgWp * 9.0 + 2.1) - 0.5) * 0.3 * jgBand(9.0);
  diffuseColor.a *= clamp(1.0 - jgPaintWear, 0.3, 1.0);
}
#endif
#ifdef USE_COLOR_ALPHA
{
  // A per-vertex fade interpolated across big triangles draws straight iso-lines; warp it with noise
  // so it breaks up like painted terrain. Fully opaque or fully clear vertices are left alone.
  float jgA = diffuseColor.a;
  float jgMid = min(jgA, 1.0 - jgA);
  float jgFadeN = jgFbm2(jgWp * 0.35 + 21.7) - 0.5 + (jgVNoise(jgWp * 1.7 + 5.3) - 0.5) * 0.4;
  diffuseColor.a = clamp(jgA + jgFadeN * min(1.0, jgMid * 4.0) * 1.1, 0.0, 1.0);
  diffuseColor.a = smoothstep(0.08, 0.92, diffuseColor.a);
}
#endif
diffuseColor.rgb = jgCol;
`;

const RIBBON_SCAN_NORMAL_GLSL = /* glsl */ `
#ifdef JG_SCAN
{
  vec3 jgScanP = -vViewPosition;
  vec3 jgScanNa = texture2D(uScanNormal, jgScanUvA).xyz * 2.0 - 1.0;
  // Scans are captured under raking light; at full depth a concrete pour reads as sandpaper.
  float jgScanDepth = uScanStrength * 0.6;
  vec3 jgScanN = jgScanPerturb(normal, jgScanP, jgScanUvA, jgScanNa, jgScanDepth);
#ifndef JG_SCAN_FRAME
  vec3 jgScanNb = texture2D(uScanNormal, jgScanUvB).xyz * 2.0 - 1.0;
  jgScanN = normalize(mix(jgScanN, jgScanPerturb(normal, jgScanP, jgScanUvB, jgScanNb, jgScanDepth), jgScanW));
#endif
  normal = jgScanN;
}
#endif
`;

const RIBBON_SCAN_AO_GLSL = /* glsl */ `
#if defined(JG_SCAN) && defined(JG_SCAN_AO)
reflectedLight.indirectDiffuse *= mix(1.0, JG_SCAN_SAMPLE(uScanAo).r, uScanStrength);
#endif
`;

/**
 * A `MeshStandardMaterial` that shades a ground ribbon (path, road, sidewalk) with the terrain's own
 * procedural surface functions, so a dirt track or asphalt strip matches painted ground: the
 * authored colour varied by the surface class's grain, roughness and micro-normal, wheel ruts or tyre
 * lanes, and (with `feather > 0`) a noise-warped edge that fades into the terrain. The geometry needs
 * a {@link RIBBON_FRAME_ATTRIBUTE} attribute from {@link ribbonSurfaceFrame}; build it wider by
 * {@link ribbonEdgeMargin} so the fade straddles the authored edge. The caller disposes the material.
 */
export function createSurfaceRibbonMaterial(options: SurfaceRibbonMaterialOptions): THREE.MeshStandardMaterial {
  const cls = terrainSurfaceClass(options.surface ?? "road");
  const classIndex = terrainSurfaceClassIndex(cls);
  const low = options.quality === "low";
  const feather = Math.max(0, options.feather ?? 0);
  const edge = feather > 0;
  const wear = clamp(options.wear ?? 0, 0, 1);
  const paved = cls === "road" || cls === "rock";
  const roughness = options.roughness ?? terrainSurfaceRoughness(cls);
  const slabs = options.slabs;
  const scan = options.scan;
  const frame = scan?.projection === "frame";
  const paint = options.paint === true;

  const material = new THREE.MeshStandardMaterial({
    color: options.color,
    roughness,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: edge || paint,
    ...(paint ? { depthWrite: false } : {}),
    vertexColors: options.vertexColors === true,
    ...(options.polygonOffset === true ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } : {}),
  });
  const uniforms = {
    uJgRough: { value: roughness },
    uJgScale: { value: options.scale ?? 1 },
    uJgHalfWidth: { value: Math.max(0.01, options.halfWidth) },
    uJgFeather: { value: Math.max(1e-3, feather) },
    uJgWarp: { value: Math.max(0, options.warp ?? 0) },
    uJgWear: { value: wear },
    uJgSlab: { value: new THREE.Vector2(Math.max(0.1, slabs?.[0] ?? 1), Math.max(0.1, slabs?.[1] ?? 1)) },
    ...(scan === undefined ? {} : surfaceScanUniforms(scan, scan.textures)),
  };
  material.defines = {
    JG_RIBBON_CLASS: String(classIndex),
    JG_SURFACE_CLASSES: String(1 << classIndex),
    ...(low ? { JG_SURFACE_LOW: "" } : {}),
    ...(edge ? { JG_RIBBON_EDGE: "" } : {}),
    ...(wear > 0 ? { JG_RIBBON_WEAR: "" } : {}),
    ...(paved ? { JG_RIBBON_PAVED: "" } : {}),
    ...(slabs === undefined ? {} : { JG_RIBBON_SLABS: "" }),
    ...(paint ? { JG_RIBBON_PAINT: "" } : {}),
    ...(scan === undefined ? {} : { ...surfaceScanDefines(scan.textures), ...(frame ? { JG_SCAN_FRAME: "" } : {}) }),
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec3 ${RIBBON_FRAME_ATTRIBUTE};
varying vec3 vJgWorldPos;
varying vec3 vJgRibbon;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vJgWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vJgRibbon = ${RIBBON_FRAME_ATTRIBUTE};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vJgWorldPos;
varying vec3 vJgRibbon;
uniform float uJgRough;
uniform float uJgScale;
uniform float uJgHalfWidth;
uniform float uJgFeather;
uniform float uJgWarp;
uniform float uJgWear;
uniform vec2 uJgSlab;
${NOISE_GLSL}
${SURFACE_FUNCTIONS_GLSL}
${SURFACE_SCAN_PARS_GLSL}`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>\n${RIBBON_FRAGMENT_GLSL}`)
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(jgRough, 0.04, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
${SURFACE_BUMP_NORMAL_GLSL}
${RIBBON_SCAN_NORMAL_GLSL}`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
${RIBBON_SCAN_AO_GLSL}`,
      );
  };
  material.customProgramCacheKey = () =>
    `jgengine-surface-ribbon-${classIndex}-${low ? "low" : "full"}-${edge ? "edge" : "hard"}-${wear > 0 ? "wear" : "clean"}-${slabs === undefined ? "poured" : "slabs"}-${surfaceScanKeyPart(scan?.textures ?? null)}-${frame ? "frame" : "world"}-${paint ? "paint" : "base"}`;
  return material;
}

/**
 * {@link createSurfaceRibbonMaterial} for a React mesh: rebuilt only when an option changes and
 * disposed on unmount. Pass `null` to get `null` (the caller falls back to a flat material).
 */
export function useSurfaceRibbonMaterial(options: SurfaceRibbonMaterialOptions | null): THREE.MeshStandardMaterial | null {
  const o = options;
  const material = useMemo(
    () => (o === null ? null : createSurfaceRibbonMaterial(o)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o === null, o?.color, o?.halfWidth, o?.surface, o?.feather, o?.warp, o?.wear, o?.roughness, o?.scale, o?.quality, o?.polygonOffset, o?.vertexColors, o?.slabs?.[0], o?.slabs?.[1], o?.scan?.textures, o?.scan?.repeat, o?.scan?.strength, o?.scan?.tint, o?.scan?.projection, o?.paint],
  );
  useEffect(() => () => material?.dispose(), [material]);
  return material;
}
