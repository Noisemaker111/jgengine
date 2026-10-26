import * as THREE from "three";

import { wetnessUniform } from "@jgengine/shell/render/livingWorld";

const WET_KEY = "jgWet";

const VERTEX_PARS = /* glsl */ `
varying vec3 vJgWetWorld;
varying vec3 vJgWetNormal;`;

const VERTEX_MAIN = /* glsl */ `#include <worldpos_vertex>
{
  #ifdef USE_INSTANCING
    mat4 jgWetModel = modelMatrix * instanceMatrix;
  #else
    mat4 jgWetModel = modelMatrix;
  #endif
  vJgWetWorld = (jgWetModel * vec4(transformed, 1.0)).xyz;
  vJgWetNormal = normalize(mat3(jgWetModel) * objectNormal);
}`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uJgWetness;
varying vec3 vJgWetWorld;
varying vec3 vJgWetNormal;
float jgWetHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float jgWetNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(jgWetHash(i), jgWetHash(i + vec2(1.0, 0.0)), u.x), mix(jgWetHash(i + vec2(0.0, 1.0)), jgWetHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

// Wet ground darkens and turns glossy; up-facing ground collects puddles that are near-mirrors with
// a flat normal, so they pick up the sky and the world reflection probe.
const FRAGMENT_SURFACE = /* glsl */ `#include <metalnessmap_fragment>
float jgPuddle = 0.0;
if (uJgWetness > 0.001) {
  // Same facing rules three applies to the shading normal, so flipped and two-sided ground still reads as up.
  vec3 jgWetN = normalize(vJgWetNormal);
  #ifdef FLIP_SIDED
    jgWetN = -jgWetN;
  #endif
  #ifdef DOUBLE_SIDED
    jgWetN *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  float jgUp = smoothstep(0.6, 0.92, jgWetN.y);
  float jgWet = uJgWetness * mix(0.55, 1.0, jgUp);
  float jgPores = 1.0 - metalnessFactor;
  diffuseColor.rgb *= mix(1.0, 0.6, jgWet * jgPores);
  roughnessFactor = mix(roughnessFactor, 0.16, jgWet * 0.8);
  float jgField = jgWetNoise(vJgWetWorld.xz * 0.16) * 0.65 + jgWetNoise(vJgWetWorld.xz * 0.53) * 0.35;
  jgPuddle = smoothstep(0.58, 0.68, jgField + (uJgWetness - 1.0) * 0.25) * jgUp * smoothstep(0.35, 0.8, uJgWetness);
  roughnessFactor = mix(roughnessFactor, 0.03, jgPuddle);
  diffuseColor.rgb *= mix(1.0, 0.55, jgPuddle * jgPores);
}`;

const FRAGMENT_NORMAL = /* glsl */ `#include <normal_fragment_maps>
if (jgPuddle > 0.0) normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), jgPuddle));`;

/**
 * Whether a material takes the wet-surface layer: lit standard surfaces, including feathered road
 * ribbons. Water, see-through glass and custom shaders keep their own look. @internal
 */
export function takesWetness(material: THREE.Material): boolean {
  const standard = material as THREE.MeshStandardMaterial;
  if (standard.isMeshStandardMaterial !== true || material.userData[WET_KEY] !== undefined) return false;
  if (material.userData.noWetness === true) return false;
  const physical = material as THREE.MeshPhysicalMaterial;
  // Feathered road and decal ribbons blend only at their edges; see-through glass is what stays dry.
  return !(physical.isMeshPhysicalMaterial === true && physical.transmission > 0) && !(material.transparent && material.opacity < 0.95);
}

/** Compiles the wet-surface layer into a standard material. Idempotent. @internal */
export function applyWetness(material: THREE.MeshStandardMaterial): void {
  if (!takesWetness(material)) return;
  material.userData[WET_KEY] = true;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    // A material whose own shader already replaced these chunks keeps its look dry.
    if (!shader.fragmentShader.includes("#include <metalnessmap_fragment>") || !shader.vertexShader.includes("#include <worldpos_vertex>")) return;
    shader.uniforms.uJgWetness = wetnessUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace("#include <worldpos_vertex>", VERTEX_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
      .replace("#include <metalnessmap_fragment>", FRAGMENT_SURFACE)
      .replace("#include <normal_fragment_maps>", FRAGMENT_NORMAL);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}|jg-wet:v1`;
  material.needsUpdate = true;
}

/** Adds the wet layer to every eligible material in `root`; returns how many it patched. @internal */
export function applyWetnessToScene(root: THREE.Object3D): number {
  let patched = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (material === undefined || !takesWetness(material)) continue;
      applyWetness(material as THREE.MeshStandardMaterial);
      patched += 1;
    }
  });
  return patched;
}
