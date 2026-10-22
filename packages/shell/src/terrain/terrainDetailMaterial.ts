import * as THREE from "three";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import type { ResolvedTerrainDetail } from "@jgengine/core/world/terrain";

import { NOISE_GLSL, PAINT_PARS_GLSL, SURFACE_BUMP_NORMAL_GLSL, SURFACE_FUNCTIONS_GLSL } from "./terrainSurfaceShader";
import type { TerrainPaintTextures } from "./terrainSurfaces";

/** The built procedural detail terrain material, ready to mount on the ground mesh. */
export interface TerrainDetailMaterialHandle {
  material: THREE.MeshStandardMaterial;
  /** Editor relief-contour strength 0..1 (0 in play); write `.value` to retune without recompiling. */
  contour: { value: number };
}

/**
 * Loaded PBR textures matching a resolved `ResolvedTerrainDetailMaterial.maps`' roles. The caller
 * (a React component, via `useTexture`/`useLoader`) owns loading and disposal; `core` never touches
 * `THREE.Texture` and this shell function never fetches a URL itself. Omitted AO/roughness skip sampling.
 */
export interface TerrainDetailMaterialTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  roughness?: THREE.Texture;
  ao?: THREE.Texture;
}

/** Surface-pass inputs beyond the resolved detail config. */
export interface TerrainDetailMaterialOptions {
  /** Authored paint coverage from {@link createTerrainPaintTextures}; omit for unpainted ground. */
  paint?: TerrainPaintTextures;
  /** Graphics tier. `low` draws one cheap mottle per surface and skips micro-normals. Default `high`. */
  quality?: GraphicsQuality;
  /**
   * Surface classes to compile (bit `1 << classIndex`); defaults to the paint's own classes. An
   * editor that can paint any surface passes {@link ALL_TERRAIN_SURFACE_CLASSES}.
   */
  classMask?: number;
  /** Initial editor relief-contour strength. Default 0. */
  contour?: number;
  /**
   * Per-painted-slot scanned color maps (slot 1 first), each with its own world tile metres. Layers
   * without a map (or beyond {@link MAX_TERRAIN_LAYER_MAPS}) keep the procedural surface response.
   */
  layerMaps?: readonly (TerrainLayerMap | undefined)[];
}


let placeholder: THREE.DataTexture | undefined;

function placeholderTexture(): THREE.Texture {
  if (placeholder !== undefined) return placeholder;
  placeholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  placeholder.needsUpdate = true;
  return placeholder;
}

const ROCK_CLASS_BIT = 1 << 4;
/** Compile every surface response, for an editor viewport whose paint can change to any surface. */
export const ALL_TERRAIN_SURFACE_CLASSES = 0x1ff;

/** One painted layer's scanned color map plus the world metres one tile covers. */
export interface TerrainLayerMap {
  color: THREE.Texture;
  tileMetres: number;
}

/** At most this many painted layers sample their own scanned map; extra layers keep procedural shading. */
export const MAX_TERRAIN_LAYER_MAPS = 4;

// Slot 0 is the unpainted base, 1–8 the paint layers, 9 slope rock.
const SLOT_GLSL = /* glsl */ `
#ifdef JG_TERRAIN_LAYER_MAPS
uniform sampler2D uLayerMap1;
uniform sampler2D uLayerMap2;
uniform sampler2D uLayerMap3;
uniform sampler2D uLayerMap4;
uniform float uLayerTile1;
uniform float uLayerTile2;
uniform float uLayerTile3;
uniform float uLayerTile4;
vec3 jgLayerMap(int slot, vec3 wp, out bool has) {
  has = false;
  if (slot == 1) { if (uLayerTile1 > 0.0) { has = true; return texture2D(uLayerMap1, wp.xz / uLayerTile1).rgb; } }
  else if (slot == 2) { if (uLayerTile2 > 0.0) { has = true; return texture2D(uLayerMap2, wp.xz / uLayerTile2).rgb; } }
  else if (slot == 3) { if (uLayerTile3 > 0.0) { has = true; return texture2D(uLayerMap3, wp.xz / uLayerTile3).rgb; } }
  else if (slot == 4) { if (uLayerTile4 > 0.0) { has = true; return texture2D(uLayerMap4, wp.xz / uLayerTile4).rgb; } }
  return vec3(0.0);
}
#endif
JgSurf jgSlot(int slot, vec3 baseTone, vec3 wp){
  vec3 jgFlatC = baseTone;
  JgSurf s;
  if (slot == 9) {
    jgFlatC = uRockColor;
    s = jgSurface(4, uRockColor, roughness, 1.0, wp);
  }
#ifdef JG_TERRAIN_PAINT
  else if (slot > 0) {
    int i = slot - 1;
    jgFlatC = uLayerColor[i];
    s = jgSurface(int(uLayerClass[i] + 0.5), uLayerColor[i], uLayerRough[i], uLayerScale[i], wp);
  }
#endif
  else {
    s = jgSurface(0, baseTone, roughness, 1.0, wp);
  }
#ifdef JG_TERRAIN_LAYER_MAPS
  if (slot > 0 && slot <= 4) {
    bool jgHasMap;
    vec3 jgMapped = jgLayerMap(slot, wp, jgHasMap);
    // The layer owns its own scan: grain, colour and all, tiled at its authored metres, and the
    // mask weights decide how much of it shows against the neighbour layer.
    if (jgHasMap) s.albedo = mix(s.albedo, jgMapped, 0.92);
  }
#endif
  s.albedo = mix(jgFlatC, s.albedo, uSurface);
  s.height *= uSurface;
  s.bump *= uSurface;
  return s;
}
`;

/**
 * A `MeshStandardMaterial` that renders terrain as ground rather than flat colour. Each painted
 * layer draws its surface type's procedural response (grass clumps and blades, dirt clods and
 * pebbles, gravel stones, cracked rock, rippled sand, wet mud, snow, road grain) in the layer's
 * authored hue, with albedo, roughness and a micro-normal. Layers meet along noise-warped,
 * height-aware edges instead of paint-cell blobs; steep slopes turn to rock; macro sweeps break up
 * tiling. Unpainted ground keeps the biome-tinted vertex colour with procedural detail, plus the
 * waterline sand and altitude snow bands. Full PBR: lit, shadowed and fogged like any standard material.
 *
 * When `detail.material` is set, pass the matching loaded `textures` (color/normal/roughness/ao):
 * they tile by world position at `detail.material.repeat` world units per tile and blend over the
 * procedural result at `detail.material.strength`.
 * @internal
 */
export function createTerrainDetailMaterial(
  detail: ResolvedTerrainDetail,
  textures?: TerrainDetailMaterialTextures,
  options: TerrainDetailMaterialOptions = {},
): TerrainDetailMaterialHandle {
  const hasTexture = textures !== undefined && detail.material !== undefined;
  const repeat = detail.material?.repeat ?? 4;
  const strength = detail.material?.strength ?? 1;
  const tint = detail.material?.tint ?? 1;
  const paint = options.paint;
  const layerMaps = (options.layerMaps ?? []).slice(0, MAX_TERRAIN_LAYER_MAPS);
  const hasLayerMaps = layerMaps.some((entry) => entry !== undefined);
  const layerMapUniforms = hasLayerMaps
    ? {
        uLayerMap1: { value: layerMaps[0]?.color ?? placeholderTexture() },
        uLayerMap2: { value: layerMaps[1]?.color ?? placeholderTexture() },
        uLayerMap3: { value: layerMaps[2]?.color ?? placeholderTexture() },
        uLayerMap4: { value: layerMaps[3]?.color ?? placeholderTexture() },
        uLayerTile1: { value: layerMaps[0]?.tileMetres ?? 0 },
        uLayerTile2: { value: layerMaps[1]?.tileMetres ?? 0 },
        uLayerTile3: { value: layerMaps[2]?.tileMetres ?? 0 },
        uLayerTile4: { value: layerMaps[3]?.tileMetres ?? 0 },
      }
    : {};
  const low = options.quality === "low";
  const contour = { value: options.contour ?? 0 };
  // Rock is always compiled for slope rock; each extra class costs shader time even where unused on
  // GPUs that run both sides of a branch.
  const classMask = (options.classMask ?? paint?.classMask ?? 0) | ROCK_CLASS_BIT;

  const uniforms = {
    uRockColor: { value: new THREE.Color(detail.rockColor) },
    uSandColor: { value: new THREE.Color(detail.sandColor) },
    uSnowColor: { value: new THREE.Color(detail.snowColor) },
    uSweepDry: { value: new THREE.Vector3(...detail.sweeps.dry) },
    uSweepWet: { value: new THREE.Vector3(...detail.sweeps.wet) },
    uRockSlopeStart: { value: detail.rockSlopeStart },
    uSnowHeight: { value: detail.snowHeight },
    uWaterLevel: { value: detail.waterLevel },
    uDetailScale: { value: Math.max(0.5, detail.detailScale) },
    uMacroScale: { value: Math.max(0.5, detail.macroScale) },
    uStrength: { value: detail.strength },
    uSurface: { value: detail.surfaceStrength },
    uContour: contour,
    ...(paint === undefined ? {} : paint.uniforms),
    ...layerMapUniforms,
    ...(hasTexture
      ? {
          uMatColor: { value: textures.color },
          uMatNormal: { value: textures.normal },
          ...(textures.roughness !== undefined ? { uMatRoughness: { value: textures.roughness } } : {}),
          ...(textures.ao !== undefined ? { uMatAo: { value: textures.ao } } : {}),
          uMatRepeat: { value: Math.max(0.01, repeat) },
          uMatStrength: { value: strength },
          uMatTint: { value: tint },
        }
      : {}),
  };

  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: detail.roughness,
    metalness: 0,
    vertexColors: true,
  });
  material.defines = {
    ...(paint === undefined ? {} : { JG_TERRAIN_PAINT: "" }),
    ...(hasLayerMaps ? { JG_TERRAIN_LAYER_MAPS: "" } : {}),
    ...(low ? { JG_SURFACE_LOW: "" } : {}),
    JG_SURFACE_CLASSES: String(classMask),
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vJgWorldPos;
varying vec3 vJgWorldNormal;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
vJgWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vJgWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    const materialUniformsGlsl = hasTexture
      ? `
uniform sampler2D uMatColor;
uniform sampler2D uMatNormal;
${textures.roughness !== undefined ? "uniform sampler2D uMatRoughness;" : ""}
${textures.ao !== undefined ? "uniform sampler2D uMatAo;" : ""}
uniform float uMatRepeat;
uniform float uMatStrength;
uniform float uMatTint;`
      : "";

    const materialColorGlsl = hasTexture
      ? `
vec2 jgMatUv = jgWp / uMatRepeat;
vec3 jgMatColor = texture2D(uMatColor, jgMatUv).rgb;
// Two separable jobs. GRAIN: the map's luminance relative to its own mid-grey shades the authored
// colour, which is what makes ground read as a surface. TINT: how much of the map's own hue
// replaces that colour — at 1 the biome palette, macro sweeps, and slope rock underneath are simply
// painted over, and a whole region collapses to the texture's single hue.
float jgMatLum = dot(jgMatColor, vec3(0.2126, 0.7152, 0.0722));
jgCol *= mix(1.0, clamp(jgMatLum / 0.35, 0.55, 1.7), uMatStrength * (1.0 - uMatTint));
jgCol = mix(jgCol, jgMatColor, uMatStrength * uMatTint);`
      : "";

    const materialRoughnessGlsl = hasTexture && textures.roughness !== undefined
      ? `
float jgMatRough = texture2D(uMatRoughness, jgMatUv).g;
// The map varies the authored roughness rather than replacing it: scanned ground roughness sits
// near 0.45, which turned matte terrain glossy enough to throw a wet sheen across dry sand.
roughnessFactor = clamp(roughnessFactor + (jgMatRough - 0.5) * uMatStrength * 0.6, 0.0, 1.0);`
      : "";

    // The map's tilt is world-space (U along +X, V along +Z on flat ground); `normal` is view-space.
    const materialNormalGlsl = hasTexture
      ? `
vec2 jgMatNormalXy = texture2D(uMatNormal, jgMatUv).rg * 2.0 - 1.0;
normal = normalize(normal + (viewMatrix * vec4(jgMatNormalXy.x, 0.0, jgMatNormalXy.y, 0.0)).xyz * uMatStrength * 0.6);`
      : "";

    const materialAoGlsl = hasTexture && textures.ao !== undefined
      ? `
float jgMatAo = texture2D(uMatAo, jgMatUv).r;
reflectedLight.indirectDiffuse *= mix(1.0, jgMatAo, uMatStrength);`
      : "";

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vJgWorldPos;
varying vec3 vJgWorldNormal;
uniform vec3 uRockColor;
uniform vec3 uSandColor;
uniform vec3 uSnowColor;
uniform vec3 uSweepDry;
uniform vec3 uSweepWet;
uniform float uRockSlopeStart;
uniform float uSnowHeight;
uniform float uWaterLevel;
uniform float uDetailScale;
uniform float uMacroScale;
uniform float uStrength;
uniform float uSurface;
uniform float uContour;
${materialUniformsGlsl}
${NOISE_GLSL}
${SURFACE_FUNCTIONS_GLSL}
#ifdef JG_TERRAIN_PAINT
${PAINT_PARS_GLSL}
#endif
${SLOT_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 jgWp = vJgWorldPos.xz;
jgFootprint = max(length(dFdx(vJgWorldPos)), length(dFdy(vJgWorldPos)));
float jgMacro = jgFbm(jgWp / uMacroScale);
float jgSlope = 1.0 - clamp(vJgWorldNormal.y, 0.0, 1.0);
float jgH = vJgWorldPos.y;
float jgRockW = smoothstep(uRockSlopeStart, uRockSlopeStart + 0.18, jgSlope) * mix(uStrength, 1.0, uSurface);

// Only the two strongest of base, eight paint slots and slope rock are shaded; a third
// contribution is negligible once the coverage is smoothed, and shading every slot cost 10x.
vec4 jgPa = vec4(0.0);
vec4 jgPb = vec4(0.0);
float jgPaintTotal = 0.0;
#ifdef JG_TERRAIN_PAINT
vec2 jgPaintTexUv = jgPaintUv(jgWp);
jgPa = texture2D(uPaintA, jgPaintTexUv);
jgPb = texture2D(uPaintB, jgPaintTexUv);
jgPaintTotal = dot(jgPa, vec4(1.0)) + dot(jgPb, vec4(1.0));
#endif
float jgPaintNorm = (1.0 - jgRockW) / max(1.0, jgPaintTotal);
jgPaintTotal = min(jgPaintTotal, 1.0);
int jgI1 = 0;
int jgI2 = 0;
float jgW1 = (1.0 - jgPaintTotal) * (1.0 - jgRockW);
float jgW2 = 0.0;
#define JG_PICK(idx, w) { float jgPk = (w); if (jgPk > jgW1) { jgI2 = jgI1; jgW2 = jgW1; jgI1 = idx; jgW1 = jgPk; } else if (jgPk > jgW2) { jgI2 = idx; jgW2 = jgPk; } }
#ifdef JG_TERRAIN_PAINT
JG_PICK(1, jgPa.r * jgPaintNorm)
JG_PICK(2, jgPa.g * jgPaintNorm)
JG_PICK(3, jgPa.b * jgPaintNorm)
JG_PICK(4, jgPa.a * jgPaintNorm)
JG_PICK(5, jgPb.r * jgPaintNorm)
JG_PICK(6, jgPb.g * jgPaintNorm)
JG_PICK(7, jgPb.b * jgPaintNorm)
JG_PICK(8, jgPb.a * jgPaintNorm)
#endif
JG_PICK(9, jgRockW)
bool jgTwo = jgW2 > 0.004;

vec3 jgBase = diffuseColor.rgb;
if (jgI1 == 0 || (jgTwo && jgI2 == 0)) {
  float jgFine = jgFbm(jgWp / uDetailScale);
  float jgPatch = jgFbm(jgWp / (uMacroScale * 0.35) + vec2(37.2, 11.7));
  float jgFleck = jgVNoise(jgWp / max(0.05, uDetailScale * 0.024));
  float jgFleckMid = jgVNoise(jgWp / max(0.12, uDetailScale * 0.07) + vec2(51.3, 7.9));
  jgBase *= mix(1.0 - 0.2 * uStrength, 1.0 + 0.16 * uStrength, jgFine);
  // Biome patchwork: hue-shifted dry sweeps and cooler wet pockets, tinted per-world via detail.sweeps.
  jgBase = mix(jgBase, jgBase * uSweepDry, smoothstep(0.5, 0.8, jgMacro) * 0.55 * uStrength);
  jgBase = mix(jgBase, jgBase * uSweepWet, smoothstep(0.52, 0.85, jgPatch) * 0.5 * uStrength);
  jgBase *= 1.0 + (jgFbm(jgWp / (uMacroScale * 2.3) + vec2(9.1, 73.4)) - 0.5) * 0.22 * uStrength;
  jgBase *= 1.0 + (jgFleck - 0.5) * 0.48 * uStrength * jgBand(1.0 / max(0.05, uDetailScale * 0.024));
  jgBase *= 1.0 + (jgFleckMid - 0.5) * 0.34 * uStrength * jgBand(1.0 / max(0.12, uDetailScale * 0.07));
}

JgSurf jgS1 = jgSlot(jgI1, jgBase, vJgWorldPos);
JgSurf jgS2 = jgS1;
float jgA1 = 1.0;
float jgA2 = 0.0;
if (jgTwo) {
  jgS2 = jgSlot(jgI2, jgBase, vJgWorldPos);
  float jgB1 = jgW1 / (jgW1 + jgW2);
  float jgB2 = 1.0 - jgB1;
  // Height-aware blend: along an edge the layer standing taller (gravel stones, grass clumps) wins
  // first, so transitions read as one material breaking through another, not a cross-fade.
  float jgH1 = jgB1 + jgS1.height * 0.5;
  float jgH2 = jgB2 + jgS2.height * 0.5;
  float jgM = max(jgH1, jgH2) - 0.28;
  jgA1 = mix(jgB1, max(0.0, jgH1 - jgM), uSurface);
  jgA2 = mix(jgB2, max(0.0, jgH2 - jgM), uSurface);
  float jgT = max(jgA1 + jgA2, 1e-4);
  jgA1 /= jgT;
  jgA2 /= jgT;
}
vec3 jgCol = jgS1.albedo * jgA1 + jgS2.albedo * jgA2;
float jgRough = jgS1.rough * jgA1 + jgS2.rough * jgA2;
float jgBumpH = jgS1.bump * jgA1 + jgS2.bump * jgA2;

// Large-scale light and sun-dried sweeps over painted ground, so a field painted one hue never tiles flat.
float jgPaintCover = jgPaintTotal * (1.0 - jgRockW) * uSurface;
jgCol *= 1.0 + (jgFbm2(jgWp / (uMacroScale * 1.3) + vec2(3.7, 61.2)) - 0.5) * 0.3 * jgPaintCover;
jgCol = mix(jgCol, jgCol * uSweepDry, smoothstep(0.52, 0.78, jgMacro) * 0.2 * jgPaintCover);

float jgSandW = smoothstep(uWaterLevel + 2.4, uWaterLevel - 0.4, jgH) * (1.0 - jgRockW) * uStrength;
jgCol = mix(jgCol, uSandColor * (0.9 + 0.2 * jgMacro), jgSandW);
float jgSnowW = smoothstep(uSnowHeight, uSnowHeight + 8.0, jgH) * (1.0 - jgRockW * 0.6) * uStrength;
jgCol = mix(jgCol, uSnowColor * (0.94 + 0.1 * jgMacro), jgSnowW);
${materialColorGlsl}
float jgContour = 0.5 + 0.5 * cos(jgH / 1.5 * 6.2831853);
jgCol *= (1.0 - uContour * 0.4 * (1.0 - jgContour)) * (1.0 + clamp(jgH * 0.03, -0.12, 0.22) * uContour);
diffuseColor.rgb = jgCol;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(jgRough, 0.04, 1.0);
${materialRoughnessGlsl}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
${SURFACE_BUMP_NORMAL_GLSL}
${materialNormalGlsl}`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
${materialAoGlsl}`,
      );
  };

  material.customProgramCacheKey = () =>
    `jgengine-terrain-detail-${hasTexture ? "tex" : "flat"}-${hasTexture && textures.roughness !== undefined ? "rough" : "scalar"}-${hasTexture && textures.ao !== undefined ? "ao" : "unoccluded"}-${paint === undefined ? "bare" : "paint"}-${hasLayerMaps ? "layers" : "procedural"}-${low ? "low" : "full"}-${classMask}`;
  return { material, contour };
}
