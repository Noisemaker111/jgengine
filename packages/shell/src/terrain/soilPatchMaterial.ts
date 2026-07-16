import * as THREE from "three";

import type { SoilRules } from "@jgengine/core/world/soilKind";

/**
 * Worley (F1/F2 cellular) crack mask + FBM moss mask — the same noise-driven-shader technique as
 * `terrainDetailMaterial.ts`'s rock/sand/snow blend, injected here via `onBeforeCompile` into a
 * dedicated soil-patch material instead of the whole-ground detail material. `F2 - F1` (the gap
 * between nearest and second-nearest Worley feature distances) goes to zero right at a cell boundary,
 * which reads as a network of cracked-earth veins once thresholded — the standard "cracked ground"
 * shader trick.
 */
const SOIL_NOISE_GLSL = /* glsl */ `
uint jgSoilHashUint(uvec2 v){
  uint x = v.x * 1664525u + v.y * 1013904223u;
  x = (x ^ (x >> 16u)) * 2246822519u;
  x = (x ^ (x >> 13u)) * 3266489917u;
  x = x ^ (x >> 16u);
  return x;
}
float jgSoilHash1(vec2 p){
  return float(jgSoilHashUint(uvec2(floor(p)))) * (1.0 / 4294967296.0);
}
vec2 jgSoilHash2(vec2 p){
  uvec2 base = uvec2(floor(p));
  float a = float(jgSoilHashUint(base)) * (1.0 / 4294967296.0);
  float b = float(jgSoilHashUint(base + uvec2(19u, 47u))) * (1.0 / 4294967296.0);
  return vec2(a, b);
}
float jgSoilVNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = jgSoilHash1(i);
  float b = jgSoilHash1(i + vec2(1.0, 0.0));
  float c = jgSoilHash1(i + vec2(0.0, 1.0));
  float d = jgSoilHash1(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float jgSoilFbm(vec2 p){
  float v = 0.0; float amp = 0.5;
  for (int i = 0; i < 4; i++){ v += amp * jgSoilVNoise(p); p *= 2.0; amp *= 0.5; }
  return v;
}
vec2 jgSoilWorleyF1F2(vec2 p){
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 8.0; float f2 = 8.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = jgSoilHash2(ip + neighbor);
      float dist = length(neighbor + point - fp);
      if (dist < f1) { f2 = f1; f1 = dist; }
      else if (dist < f2) { f2 = dist; }
    }
  }
  return vec2(f1, f2);
}
`;

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

/**
 * A `MeshStandardMaterial` for one authored `soil` volume: a base dirt tint with a Worley crack-line
 * network and an FBM moss-patch overlay injected via `onBeforeCompile`, seeded from `rules.seed`. Full
 * PBR — lit, shadowed, fogged — like the terrain detail material it borrows its noise machinery from.
 * A game never calls this directly — author a soil patch via the editor's `soil` studio kind.
 * @internal
 */
export function createSoilPatchMaterial(rules: SoilRules): THREE.MeshStandardMaterial {
  const seedOffset = hashSeed(rules.seed);
  const material = new THREE.MeshStandardMaterial({
    color: rules.baseColor,
    roughness: 0.92,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSoilCrackColor = { value: new THREE.Color(rules.crackColor) };
    shader.uniforms.uSoilCrackScale = { value: Math.max(0.1, rules.crackScale) };
    shader.uniforms.uSoilCrackIntensity = { value: rules.crackIntensity };
    shader.uniforms.uSoilMossColor = { value: new THREE.Color(rules.mossColor) };
    shader.uniforms.uSoilMossCoverage = { value: rules.mossCoverage };
    shader.uniforms.uSoilSeed = { value: seedOffset };

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vJgSoilWorldPos;`,
    ).replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vJgSoilWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vJgSoilWorldPos;
uniform vec3 uSoilCrackColor;
uniform float uSoilCrackScale;
uniform float uSoilCrackIntensity;
uniform vec3 uSoilMossColor;
uniform float uSoilMossCoverage;
uniform float uSoilSeed;
${SOIL_NOISE_GLSL}`,
    ).replace(
      "#include <color_fragment>",
      `#include <color_fragment>
vec2 jgSoilP = vJgSoilWorldPos.xz + vec2(uSoilSeed * 0.37, uSoilSeed * 0.71);
vec2 jgSoilF1F2 = jgSoilWorleyF1F2(jgSoilP / uSoilCrackScale);
float jgSoilCrack = 1.0 - smoothstep(0.0, 0.1, jgSoilF1F2.y - jgSoilF1F2.x);
vec3 jgSoilCol = mix(diffuseColor.rgb, uSoilCrackColor, jgSoilCrack * uSoilCrackIntensity);
float jgSoilMossN = jgSoilFbm(jgSoilP / 2.4);
float jgSoilMossMask = smoothstep(1.0 - uSoilMossCoverage, 1.0 - uSoilMossCoverage + 0.18, jgSoilMossN);
jgSoilCol = mix(jgSoilCol, uSoilMossColor, jgSoilMossMask);
diffuseColor.rgb = jgSoilCol;`,
    );
  };

  material.customProgramCacheKey = () =>
    `jgengine-soil-${rules.crackScale}-${rules.crackIntensity}-${rules.mossCoverage}-${seedOffset}`;

  return material;
}
