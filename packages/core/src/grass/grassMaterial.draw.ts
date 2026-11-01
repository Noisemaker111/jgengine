import * as THREE from "three";

import type { GrassLook } from "@jgengine/core/grass/grassKind";

/** Uniforms the grass shader reads; the stream rewrites the `uLod` row per camera. */
export interface GrassShaderUniforms {
  uTime: THREE.IUniform<number>;
  /** x: share numerator (share = min(1, x / d²)), y: 1 perspective / 0 orthographic, z: reach in metres, w: orthographic share. */
  uLod: THREE.IUniform<THREE.Vector4>;
  uWind: THREE.IUniform<THREE.Vector4>;
  uWindDirection: THREE.IUniform<THREE.Vector2>;
  uShape: THREE.IUniform<THREE.Vector4>;
  uFlower: THREE.IUniform<number>;
  uBaseColor: THREE.IUniform<THREE.Color>;
  uTipColor: THREE.IUniform<THREE.Color>;
  uMixColor: THREE.IUniform<THREE.Color>;
  uFlowerColor: THREE.IUniform<THREE.Color>;
  uFlowerColor2: THREE.IUniform<THREE.Color>;
  uGroundColor: THREE.IUniform<THREE.Color>;
  uTone: THREE.IUniform<THREE.Vector4>;
  uNoise: THREE.IUniform<THREE.Vector2>;
  uLight: THREE.IUniform<THREE.Vector2>;
  /** Mow stripes: x width in metres (0 off), y contrast, zw heading as a unit vector. */
  uStripe: THREE.IUniform<THREE.Vector4>;
}

/** The grass blade material and the uniforms behind it. */
export interface GrassMaterialHandle {
  material: THREE.MeshStandardMaterial;
  uniforms: GrassShaderUniforms;
  /** Largest sideways wind travel of a blade tip, metres, for conservative bounds. */
  windReach: number;
}

const VERTEX_HEAD = /* glsl */ `
#include <common>
attribute vec3 instanceOffset;
attribute vec4 instanceShape;
attribute vec4 instanceVary;
attribute float instanceTone;
attribute vec2 grassUv;
attribute vec2 bladeOffset;
attribute vec4 bladeVary;
attribute float bladeBendScale;
uniform float uTime;
uniform vec4 uLod;
uniform vec4 uWind;
uniform vec2 uWindDirection;
uniform vec4 uShape;
uniform float uFlower;
uniform vec4 uStripe;
varying float vGrassT;
varying float vGrassStripe;
varying float vGrassRoll;
varying float vGrassKind;
varying float vGrassTone;
varying float vGrassFade;
varying vec2 vGrassPetal;
vec3 jgGrassPosition;
vec3 jgGrassNormal;
float jgProfile(float t) {
  float needle = pow(max(1.0 - t, 0.0), 0.85);
  float strap = (1.0 - 0.25 * t) * (1.0 - smoothstep(0.6, 1.0, t) * 0.92);
  float leaf = clamp(sin(3.14159 * (0.12 + 0.88 * t)) * 1.25, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, t) * 0.8);
  return uShape.x < 0.5 ? mix(needle, strap, uShape.x * 2.0) : mix(strap, leaf, uShape.x * 2.0 - 1.0);
}
void jgComputeGrassBlade() {
  bool petal = grassUv.y > 1.5;
  float t = petal ? 1.0 : position.y;
  vec3 root = (modelMatrix * vec4(instanceOffset, 1.0)).xyz;
  float camDist = distance(root, cameraPosition);
  // Screen-density LOD: a tuft survives while its rank is under the share its distance allows;
  // survivors widen to keep the field's silhouette, and everything dissolves before blades go sub-pixel.
  float share = uLod.y > 0.5 ? min(1.0, uLod.x / max(camDist * camDist, 1e-4)) : uLod.w;
  float rank = instanceVary.w;
  float keep = 1.0 - smoothstep(share * 0.7, share, rank);
  float fade = uLod.y > 0.5 ? smoothstep(uLod.z * 0.6, uLod.z, camDist) : 0.0;
  keep *= 1.0 - fade;
  float widen = pow(max(share, 1e-4), -0.75);
  float kind = instanceVary.z;
  float flower = step(1.5, kind);
  float height = instanceShape.y * bladeVary.y * keep;
  float phi = min(instanceShape.w * bladeBendScale * 1.5708, 1.75);
  float a = phi * t;
  vec2 arc = phi > 1e-3 ? vec2(sin(a), 1.0 - cos(a)) / phi : vec2(t, 0.0);
  float width = instanceShape.z * bladeVary.z * jgProfile(t) * widen * keep;
  vec3 local = vec3(petal ? 0.0 : position.x * width, arc.x * height, arc.y * height);
  vec3 localNormal = vec3(0.0, -sin(a), cos(a));
  float bladeYaw = instanceShape.x + bladeVary.x;
  float cy = cos(bladeYaw), sy = sin(bladeYaw);
  vec3 yawed = vec3(local.x * cy + local.z * sy, local.y, -local.x * sy + local.z * cy);
  vec3 yawedNormal = vec3(localNormal.x * cy + localNormal.z * sy, localNormal.y, -localNormal.x * sy + localNormal.z * cy);
  float ct = cos(instanceShape.x), st = sin(instanceShape.x);
  vec3 tuftOffset = vec3(bladeOffset.x * ct + bladeOffset.y * st, 0.0, -bladeOffset.x * st + bladeOffset.y * ct);
  // Rolling gust field: three phase-offset waves, one carrying a cross-wind term, sweep the meadow.
  vec2 windPerp = vec2(-uWindDirection.y, uWindDirection.x);
  float gustPhase = dot(instanceOffset.xz, uWindDirection) * uWind.z + uTime * uWind.y + instanceVary.x;
  float crossPhase = dot(instanceOffset.xz, windPerp) * uWind.z * 0.6;
  float gust = sin(gustPhase) * 0.55 + sin(gustPhase * 0.53 + crossPhase + 2.1) * 0.32 + sin(gustPhase * 1.7 + crossPhase * 0.4 + 4.3) * 0.13;
  float flutter = sin(uTime * 7.5 + instanceVary.x * 2.7 + bladeVary.w * 6.2832) * uWind.w;
  float sway = (gust * uWind.x + flutter) * t * t * (0.4 + 0.6 * bladeVary.y) * keep * min(1.0 + instanceShape.y * 0.6, 2.2);
  vec2 windOffset = uWindDirection * sway;
  jgGrassPosition = instanceOffset + tuftOffset + yawed + vec3(windOffset.x, -abs(sway) * 0.25 * t, windOffset.y);
  if (petal) {
    // The flower head billboards at the first blade's tip; non-flowering tufts collapse it.
    vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
    vec3 up = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
    float size = uFlower * flower * keep * mix(0.75, 1.25, instanceVary.y) * (1.0 + (widen - 1.0) * 0.5);
    vec3 billboard = (right * position.x + up * position.y) * size;
    jgGrassPosition += billboard / vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  }
  jgGrassNormal = normalize(mix(normalize(yawedNormal), vec3(0.0, 1.0, 0.0), uShape.y));
  vGrassT = t;
  vGrassRoll = instanceVary.y;
  vGrassKind = petal ? 2.0 + mod(kind, 2.0) : mod(kind, 2.0);
  vGrassTone = instanceTone;
  // Mirrors grassStripeAt, so blade stripes line up with the turf mat's.
  float stripeBand = sin(dot(instanceOffset.xz, uStripe.zw) * 3.14159265 / max(uStripe.x, 1e-3));
  vGrassStripe = uStripe.x > 0.0 ? smoothstep(-0.15, 0.15, stripeBand) * 2.0 - 1.0 : 0.0;
  vGrassFade = fade;
  vGrassPetal = petal ? vec2(grassUv.x, grassUv.y - 2.0) : vec2(-1.0);
}
`;

const FRAGMENT_HEAD = /* glsl */ `
#include <common>
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uMixColor;
uniform vec3 uFlowerColor;
uniform vec3 uFlowerColor2;
uniform vec3 uGroundColor;
uniform vec4 uTone;
uniform vec2 uNoise;
uniform vec2 uLight;
uniform vec4 uStripe;
varying float vGrassT;
varying float vGrassStripe;
varying float vGrassRoll;
varying float vGrassKind;
varying float vGrassTone;
varying float vGrassFade;
varying vec2 vGrassPetal;
vec3 jgHueShift(vec3 color, float angle) {
  const vec3 k = vec3(0.57735);
  float c = cos(angle);
  return color * c + cross(k, color) * sin(angle) + k * dot(k, color) * (1.0 - c);
}
`;

const FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
vec3 grassColor;
if (vGrassKind > 1.5) {
  vec2 petal = vGrassPetal - 0.5;
  if (dot(petal, petal) > 0.25) discard;
  grassColor = mix(uFlowerColor, uFlowerColor2, step(0.5, fract(vGrassRoll * 7.31)));
  grassColor *= mix(0.55, 1.0, smoothstep(0.0, 0.3, length(petal)));
} else {
  float roll2 = fract(vGrassRoll * 13.7);
  float roll3 = fract(vGrassRoll * 29.3);
  vec3 tip = vGrassKind > 0.5 ? uMixColor : uTipColor;
  float center = mix(0.1, 0.95, uTone.x);
  grassColor = mix(uBaseColor, tip, smoothstep(center - 0.35, center + 0.35, vGrassT));
  grassColor = jgHueShift(grassColor, (roll2 - 0.5) * uNoise.x * 0.6);
  grassColor *= 1.0 + (roll3 - 0.5) * uNoise.y * 0.7;
  // Season and drought: the field's tone patches push each tuft ahead of or behind the look's setting.
  float lum = dot(grassColor, vec3(0.3, 0.55, 0.15));
  float season = clamp(uTone.y + (vGrassTone - 0.5) * uTone.w * 0.9, 0.0, 1.0);
  grassColor = mix(grassColor, vec3(0.78, 0.65, 0.25) * lum * 1.6, min(1.0, season * 2.0) * 0.75);
  grassColor = mix(grassColor, vec3(0.65, 0.33, 0.17) * lum * 1.7, max(0.0, season * 2.0 - 1.0) * 0.8);
  float dry = clamp(uTone.z + (vGrassTone - 0.5) * uTone.w * 0.7, 0.0, 1.0);
  float dryReach = dry * smoothstep(-0.3, 1.0, vGrassT + dry * 0.6);
  grassColor = mix(grassColor, vec3(0.79, 0.70, 0.48) * (0.6 + lum), dryReach);
  grassColor *= 1.0 + vGrassStripe * uStripe.y * 0.6;
  // Roots take the ground colour so blades grow out of the terrain instead of floating on it.
  grassColor = mix(mix(uGroundColor, grassColor, 0.45), grassColor, smoothstep(0.0, 0.3, vGrassT));
}
grassColor = mix(grassColor, uGroundColor * 1.04, vGrassFade * 0.55);
diffuseColor.rgb = grassColor;
`;

const LIGHT_END = /* glsl */ `
#include <lights_fragment_end>
// Warm tip glow where sun shines through the blades, scaled by direct light; no extra lights.
float jgTipMask = smoothstep(0.55, 1.0, vGrassT) * step(vGrassKind, 1.5);
float jgLit = clamp(dot(reflectedLight.directDiffuse, vec3(0.3333)) * 1.6, 0.0, 1.0);
reflectedLight.directDiffuse += vec3(0.34, 0.28, 0.12) * jgTipMask * jgLit * uLight.x * (1.0 - vGrassFade * 0.7);
`;

/** Build the one grass material for a look; `groundColor` is the terrain the roots blend into. */
export function createGrassMaterial(look: GrassLook, groundColor?: THREE.ColorRepresentation): GrassMaterialHandle {
  const base = new THREE.Color(look.colour.baseColor);
  const heading = (look.wind.windDirection * Math.PI) / 180;
  const stripeHeading = (look.mowing.stripeAngle * Math.PI) / 180;
  const softness = 1.25 - look.blade.stiffness;
  const strength = look.wind.windStrength * 0.6 * softness;
  const flutter = look.wind.windStrength * 0.18 * softness;
  const uniforms: GrassShaderUniforms = {
    uTime: { value: 0 },
    uLod: { value: new THREE.Vector4(1e6, 1, 1e6, 1) },
    uWind: { value: new THREE.Vector4(strength, look.wind.windSpeed, 0.04 + (1 - look.wind.windGust) * 0.02 + look.wind.windGust * 0.5, flutter) },
    uWindDirection: { value: new THREE.Vector2(Math.cos(heading), Math.sin(heading)) },
    uShape: { value: new THREE.Vector4(look.blade.profile, look.lighting.normalLift, 0, 0) },
    uFlower: { value: look.flowers.flowerSize },
    uBaseColor: { value: base },
    uTipColor: { value: new THREE.Color(look.colour.tipColor) },
    uMixColor: { value: new THREE.Color(look.species.mixColor) },
    uFlowerColor: { value: new THREE.Color(look.flowers.flowerColor) },
    uFlowerColor2: { value: new THREE.Color(look.flowers.flowerColor2) },
    uGroundColor: { value: groundColor === undefined ? base.clone().multiplyScalar(0.8) : new THREE.Color(groundColor) },
    uTone: { value: new THREE.Vector4(look.colour.gradient, look.season.season, look.season.dryness, look.season.seasonNoise) },
    uNoise: { value: new THREE.Vector2(look.colour.hueNoise, look.colour.valueNoise) },
    uLight: { value: new THREE.Vector2(look.lighting.translucency, 0) },
    uStripe: { value: new THREE.Vector4(look.mowing.stripeWidth, look.mowing.stripeContrast, Math.cos(stripeHeading), Math.sin(stripeHeading)) },
  };
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: look.lighting.roughness, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", VERTEX_HEAD)
      .replace("#include <beginnormal_vertex>", "jgComputeGrassBlade();\nvec3 objectNormal = jgGrassNormal;")
      .replace("#include <begin_vertex>", "vec3 transformed = jgGrassPosition;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", FRAGMENT_HEAD)
      .replace("#include <color_fragment>", FRAGMENT_COLOR)
      .replace("#include <lights_fragment_end>", LIGHT_END);
  };
  material.customProgramCacheKey = () => "jgengine-grass";
  return { material, uniforms, windReach: (strength + flutter) * 2.2 + 0.05 };
}
