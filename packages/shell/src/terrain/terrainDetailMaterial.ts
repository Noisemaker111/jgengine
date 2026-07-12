import * as THREE from "three";

import type { ResolvedTerrainDetail } from "@jgengine/core/world/terrain";

/** The built procedural detail terrain material, ready to mount on the ground mesh. */
export interface TerrainDetailMaterialHandle {
  material: THREE.MeshStandardMaterial;
}

const NOISE_GLSL = /* glsl */ `
float jgHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float jgVNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = jgHash(i);
  float b = jgHash(i + vec2(1.0, 0.0));
  float c = jgHash(i + vec2(0.0, 1.0));
  float d = jgHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float jgFbm(vec2 p){
  float v = 0.0; float amp = 0.5;
  for (int i = 0; i < 4; i++){ v += amp * jgVNoise(p); p *= 2.0; amp *= 0.5; }
  return v;
}
`;

/**
 * A `MeshStandardMaterial` whose fragment shader keeps the biome-tinted vertex
 * colour as the base ground and blends procedural, noise-broken rock (by slope),
 * sand (by waterline), and snow (by height) over it — textured-reading terrain
 * with no image assets. Full PBR: lit, shadowed, and fogged like any standard
 * material, so it composes with the post-processing chain.
 */
export function createTerrainDetailMaterial(detail: ResolvedTerrainDetail): TerrainDetailMaterialHandle {
  const uniforms = {
    uRockColor: { value: new THREE.Color(detail.rockColor) },
    uSandColor: { value: new THREE.Color(detail.sandColor) },
    uSnowColor: { value: new THREE.Color(detail.snowColor) },
    uRockSlopeStart: { value: detail.rockSlopeStart },
    uSnowHeight: { value: detail.snowHeight },
    uWaterLevel: { value: detail.waterLevel },
    uDetailScale: { value: Math.max(0.5, detail.detailScale) },
    uMacroScale: { value: Math.max(0.5, detail.macroScale) },
    uStrength: { value: detail.strength },
  };

  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: detail.roughness,
    metalness: 0,
    vertexColors: true,
  });

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

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vJgWorldPos;
varying vec3 vJgWorldNormal;
uniform vec3 uRockColor;
uniform vec3 uSandColor;
uniform vec3 uSnowColor;
uniform float uRockSlopeStart;
uniform float uSnowHeight;
uniform float uWaterLevel;
uniform float uDetailScale;
uniform float uMacroScale;
uniform float uStrength;
${NOISE_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 jgWp = vJgWorldPos.xz;
float jgFine = jgFbm(jgWp / uDetailScale);
float jgMacro = jgFbm(jgWp / uMacroScale);
float jgSlope = 1.0 - clamp(vJgWorldNormal.y, 0.0, 1.0);
float jgH = vJgWorldPos.y;
vec3 jgBase = diffuseColor.rgb;
jgBase *= mix(1.0 - 0.22 * uStrength, 1.0 + 0.18 * uStrength, jgFine);
jgBase = mix(jgBase, jgBase * vec3(0.86, 0.9, 0.82), jgMacro * 0.25 * uStrength);
vec3 jgRock = uRockColor * mix(0.72, 1.15, jgFbm(jgWp / (uDetailScale * 1.7)));
float jgRockW = smoothstep(uRockSlopeStart, uRockSlopeStart + 0.18, jgSlope) * uStrength;
vec3 jgCol = mix(jgBase, jgRock, jgRockW);
vec3 jgSand = uSandColor * mix(0.9, 1.08, jgFine);
float jgSandW = smoothstep(uWaterLevel + 2.4, uWaterLevel - 0.4, jgH) * (1.0 - jgRockW) * uStrength;
jgCol = mix(jgCol, jgSand, jgSandW);
vec3 jgSnow = uSnowColor * mix(0.94, 1.04, jgFine);
float jgSnowW = smoothstep(uSnowHeight, uSnowHeight + 8.0, jgH) * (1.0 - jgRockW * 0.6) * uStrength;
jgCol = mix(jgCol, jgSnow, jgSnowW);
diffuseColor.rgb = jgCol;`,
      );
  };

  material.customProgramCacheKey = () => `jgengine-terrain-detail-${detail.rockSlopeStart}-${detail.snowHeight}`;
  return { material };
}
