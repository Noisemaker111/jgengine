import * as THREE from "three";

import type { SurfaceDetailLevel } from "@jgengine/core/settings/graphicsProfile";

const ORIGINAL_KEY = "jgSurfaceOriginal";
const OPT_OUT_KEY = "jgSurfaceDetail";

interface OriginalParams {
  roughness: number;
  metalness: number;
  envMapIntensity: number;
}

let activeLevel: SurfaceDetailLevel = "full";
let gameEnabled = true;
const compiled = new Set<THREE.Material>();
const strengthUniform = { value: 1 };

const VERTEX_PARS = /* glsl */ `
varying vec3 vJgSurfPos;`;

// Captured before skinning so the pattern rides the bind pose instead of swimming through animated limbs;
// the scale terms convert bind/object units to roughly world metres so one frequency suits every pack.
const VERTEX_MAIN = /* glsl */ `
vec3 jgSurfScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
#ifdef USE_SKINNING
  jgSurfScale *= length((bindMatrixInverse * boneMatX * bindMatrix)[0].xyz);
#endif
vJgSurfPos = transformed * jgSurfScale;
#ifdef USE_INSTANCING
  vJgSurfPos *= vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vJgSurfPos += mod(instanceMatrix[3].xyz, 97.0);
#endif
#include <skinning_vertex>`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vJgSurfPos;
uniform float jgSurfStrength;
float jgSurfHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float jgSurfNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(jgSurfHash(i), jgSurfHash(i + vec3(1, 0, 0)), u.x), mix(jgSurfHash(i + vec3(0, 1, 0)), jgSurfHash(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(jgSurfHash(i + vec3(0, 0, 1)), jgSurfHash(i + vec3(1, 0, 1)), u.x), mix(jgSurfHash(i + vec3(0, 1, 1)), jgSurfHash(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}`;

// Three octaves of object-space value noise, each faded once a pixel spans its cell so distance never
// shimmers: broad mottling, brush-scale variation and fine speckle. Wear lifts raised spots paler and drier.
const COLOR_MAIN = /* glsl */ `
#include <color_fragment>
float jgFootprint = max(length(dFdx(vJgSurfPos)), length(dFdy(vJgSurfPos)));
float jgBroad = jgSurfNoise(vJgSurfPos * 1.6);
float jgMid = mix(0.5, jgSurfNoise(vJgSurfPos * 4.5 + 7.0), 1.0 - smoothstep(0.12, 0.4, jgFootprint * 4.5));
float jgFine = mix(0.5, jgSurfNoise(vJgSurfPos * 12.0 + 17.0), 1.0 - smoothstep(0.12, 0.4, jgFootprint * 12.0));
float jgWear = smoothstep(0.56, 0.8, jgBroad * 0.45 + jgMid * 0.4 + jgFine * 0.15) * jgSurfStrength;
float jgLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb *= 1.0 + ((jgBroad - 0.5) * 0.2 + (jgMid - 0.5) * 0.16 + (jgFine - 0.5) * 0.1) * jgSurfStrength;
diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(jgLuma), diffuseColor.rgb, 0.7) * 1.18, jgWear * 0.5);`;

const ROUGHNESS_MAIN = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + ((jgMid - 0.5) * 0.24 + (jgFine - 0.5) * 0.12 + jgWear * 0.08) * jgSurfStrength, 0.04, 1.0);`;

// Mikkelsen's screen-space bump with unnormalized frame vectors, so the height is in metres and the
// slope reads the same at every distance; fades before the grain aliases.
const NORMAL_MAIN = /* glsl */ `
#include <normal_fragment_maps>
{
  float jgGrainFade = 1.0 - smoothstep(0.12, 0.4, jgFootprint * 34.0);
  float jgHeight = (jgMid * 0.012 + jgFine * 0.006 + jgSurfNoise(vJgSurfPos * 34.0 + 41.0) * 0.003 * jgGrainFade) * jgSurfStrength;
  vec3 jgDpdx = dFdx(-vViewPosition);
  vec3 jgDpdy = dFdy(-vViewPosition);
  vec3 jgR1 = cross(jgDpdy, normal);
  vec3 jgR2 = cross(normal, jgDpdx);
  float jgDet = dot(jgDpdx, jgR1) * faceDirection;
  vec3 jgGrad = sign(jgDet) * (dFdx(jgHeight) * jgR1 + dFdy(jgHeight) * jgR2);
  normal = normalize(abs(jgDet) * normal - jgGrad);
}`;

// Cheap cavity: down-facing and mottled-dark spots receive less sky, which grounds a form without an AO pass.
const OCCLUSION_MAIN = /* glsl */ `
#include <aomap_fragment>
{
  float jgUp = inverseTransformDirection(normal, viewMatrix).y * 0.5 + 0.5;
  float jgCavity = mix(1.0, mix(0.7, 1.0, jgUp) * (0.88 + 0.12 * jgBroad), jgSurfStrength);
  reflectedLight.indirectDiffuse *= jgCavity;
  reflectedLight.indirectSpecular *= jgCavity;
}`;

function isStandard(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
}

/**
 * Whether the procedural surface pass suits this material: an opaque standard/physical surface without
 * its own normal map (flat colour, vertex colour, or a palette-atlas texture like KayKit's).
 * @internal
 */
export function modelSurfaceEligible(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return isStandard(material) && material.normalMap === null && !material.transparent && material.alphaTest === 0;
}

/** The level a material compiles with right now: the global tier unless the material opted out. @internal */
export function materialSurfaceLevel(material: THREE.Material): SurfaceDetailLevel {
  if (material.userData[OPT_OUT_KEY] === false || !modelSurfaceEligible(material)) return "off";
  return activeLevel;
}

function surfaceOnBeforeCompile(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms): void {
  if (!compiled.has(this)) {
    compiled.add(this);
    const material = this;
    material.addEventListener("dispose", function release() {
      material.removeEventListener("dispose", release);
      compiled.delete(material);
    });
  }
  const level = materialSurfaceLevel(this);
  if (level === "off") return;
  shader.uniforms.jgSurfStrength = strengthUniform;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>${VERTEX_PARS}`)
    .replace("#include <skinning_vertex>", VERTEX_MAIN);
  let fragment = shader.fragmentShader
    .replace("#include <common>", `#include <common>${FRAGMENT_PARS}`)
    .replace("#include <color_fragment>", COLOR_MAIN)
    .replace("#include <roughnessmap_fragment>", ROUGHNESS_MAIN)
    .replace("#include <aomap_fragment>", OCCLUSION_MAIN);
  if (level === "full") fragment = fragment.replace("#include <normal_fragment_maps>", NORMAL_MAIN);
  shader.fragmentShader = fragment;
}

function surfaceCacheKey(this: THREE.Material): string {
  return `jg-surface:v1:${materialSurfaceLevel(this)}`;
}

/**
 * Re-tune a glTF material's exported finish into the painted range: glossy 0.4–0.5 roughness reads as
 * plastic, and metallic 1 / roughness 1 with no map is an exporter default that renders near-black.
 * @internal
 */
export function normalizeModelMaterial(material: THREE.MeshStandardMaterial): void {
  if (material.userData[ORIGINAL_KEY] !== undefined) return;
  const original: OriginalParams = { roughness: material.roughness, metalness: material.metalness, envMapIntensity: material.envMapIntensity };
  material.userData[ORIGINAL_KEY] = original;
  if (material.roughnessMap === null) material.roughness = 0.6 + 0.35 * THREE.MathUtils.clamp(material.roughness, 0, 1);
  if (material.metalnessMap === null) {
    material.metalness = original.metalness >= 0.99 && original.roughness >= 0.99 ? 0.1 : Math.min(material.metalness, 0.85);
  }
  material.envMapIntensity = Math.min(material.envMapIntensity, 0.8);
}

/**
 * Give every eligible material in a freshly loaded model the engine's default painted finish: exported
 * PBR params normalized and a shared, tier-aware procedural detail shader (object-space mottling, wear,
 * roughness break-up, micro-normal and cavity). Idempotent; materials with their own normal maps, cutout
 * or transparent materials and non-standard materials are left untouched.
 * @internal
 */
export function applyModelSurface(root: THREE.Object3D): void {
  if (!gameEnabled) return;
  const seen = new Set<THREE.Material>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(material) || !modelSurfaceEligible(material)) continue;
      seen.add(material);
      normalizeModelMaterial(material);
      if (material.onBeforeCompile === surfaceOnBeforeCompile) continue;
      if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue;
      material.onBeforeCompile = surfaceOnBeforeCompile;
      material.customProgramCacheKey = surfaceCacheKey;
    }
  });
}

/**
 * Opt one cloned material out of the default surface: restore its exported params and compile it
 * without the detail shader. Used for a model whose `surfaceDetail` is `false`.
 * @internal
 */
export function optOutModelSurface(material: THREE.Material): void {
  const original = material.userData[ORIGINAL_KEY] as OriginalParams | undefined;
  material.userData[OPT_OUT_KEY] = false;
  if (original !== undefined && isStandard(material)) {
    material.roughness = original.roughness;
    material.metalness = original.metalness;
    material.envMapIntensity = original.envMapIntensity;
  }
  material.needsUpdate = true;
}

/**
 * Select the surface-detail level every patched model material compiles with, and whether models loaded
 * from now on get the default finish at all (a game's `surfaceDetail: false`). Changing the level
 * recompiles only materials already drawn; programs are shared per level, so the count stays bounded.
 * @internal
 */
export function configureModelSurface(enabled: boolean, level: SurfaceDetailLevel): void {
  gameEnabled = enabled;
  const next = enabled ? level : "off";
  if (next === activeLevel) return;
  activeLevel = next;
  for (const material of compiled) material.needsUpdate = true;
}

/** Current model surface-detail level. @internal */
export function modelSurfaceLevel(): SurfaceDetailLevel {
  return activeLevel;
}
