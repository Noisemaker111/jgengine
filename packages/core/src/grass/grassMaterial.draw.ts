import * as THREE from "three";

import type { GrassBlade, GrassLook } from "@jgengine/core/grass/grassKind";
import type { GrassWindLook } from "./grassWind";

/** Uniforms the grass shader reads; the stream rewrites the `uLod` row per camera. */
export interface GrassShaderUniforms {
  uTime: THREE.IUniform<number>;
  /** x: share numerator (share = min(1, x / d²)), y: 1 perspective / 0 orthographic, z: reach in metres, w: orthographic share. */
  uLod: THREE.IUniform<THREE.Vector4>;
  uWind: THREE.IUniform<THREE.Vector4>;
  uWindDirection: THREE.IUniform<THREE.Vector2>;
  /** x profile, y normal lift, z twist, w fold. */
  uShape: THREE.IUniform<THREE.Vector4>;
  /** x tip droop, y resting lean, z head shape. */
  uForm: THREE.IUniform<THREE.Vector4>;
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
  /** x variegated margins, y cross bands, z head shape. */
  uPattern: THREE.IUniform<THREE.Vector4>;
  uPatternColor: THREE.IUniform<THREE.Color>;
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
attribute vec2 bladeBend;
uniform float uTime;
uniform vec4 uLod;
uniform vec4 uWind;
uniform vec2 uWindDirection;
uniform vec4 uShape;
uniform vec4 uForm;
uniform float uFlower;
uniform vec4 uStripe;
varying float vGrassT;
varying float vGrassU;
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
  // A blade leaves its root at its splay lean and arcs over; droop tightens the arc toward the tip.
  float lean0 = bladeBend.y;
  float phi = min(instanceShape.w * bladeBend.x * 1.5708, 1.75) + uForm.x * 2.4 * t;
  float a = lean0 + phi * t;
  vec2 arc = phi > 1e-3 ? vec2(sin(a) - sin(lean0), cos(lean0) - cos(a)) / phi : vec2(cos(lean0), sin(lean0)) * t;
  float width = instanceShape.z * bladeVary.z * jgProfile(t) * widen * keep;
  vec3 bentNormal = vec3(0.0, -sin(a), cos(a));
  // Twist turns the blade face about its own axis toward the tip, alternating hand blade to blade.
  float twist = uShape.z * 3.14159 * t * (bladeVary.w > 0.5 ? 1.0 : -1.0);
  vec3 across = vec3(cos(twist), 0.0, 0.0) + bentNormal * sin(twist);
  vec3 faceNormal = bentNormal * cos(twist) - vec3(sin(twist), 0.0, 0.0);
  // Fold tilts each half's normal toward the other edge, so the blade shades as a V-channel.
  float side = position.x < 0.0 ? -1.0 : 1.0;
  vec3 localNormal = normalize(faceNormal - across * side * uShape.w * 1.1);
  vec3 local = vec3(0.0, arc.x * height, arc.y * height) + (petal ? vec3(0.0) : across * position.x * width);
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
  float rest = uForm.y * t * t * height;
  vec2 windOffset = uWindDirection * (sway + rest * 0.9);
  jgGrassPosition = instanceOffset + tuftOffset + yawed + vec3(windOffset.x, -abs(sway) * 0.25 * t - rest * 0.35, windOffset.y);
  if (petal) {
    // The flower head billboards at the first blade's tip; non-flowering tufts collapse it.
    vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
    vec3 up = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
    float size = uFlower * flower * keep * mix(0.75, 1.25, instanceVary.y) * (1.0 + (widen - 1.0) * 0.5);
    // A spike stands upright on the tip and stretches tall and narrow; a blossom faces the camera.
    float spike = uForm.z;
    vec3 axis = normalize(mix(up, vec3(0.0, 1.0, 0.0), spike));
    vec3 billboard = (right * position.x * (1.0 - spike * 0.55) + axis * (position.y + 0.5 * spike) * (1.0 + spike * 3.0)) * size;
    jgGrassPosition += billboard / vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  }
  jgGrassNormal = normalize(mix(normalize(yawedNormal), vec3(0.0, 1.0, 0.0), uShape.y));
  vGrassT = t;
  vGrassU = grassUv.x;
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
uniform vec4 uPattern;
uniform vec3 uPatternColor;
varying float vGrassT;
varying float vGrassU;
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
  // A blossom is a round disc with a dark eye. A seed spike is a teardrop that tapers to a point,
  // with a ragged spikelet edge, so a big plume reads as feathered rather than as a smooth solid.
  float spike = uPattern.z;
  float y = clamp(vGrassPetal.y, 0.0, 1.0);
  float disc = sqrt(max(0.25 - petal.y * petal.y, 0.0));
  float tear = 0.5 * pow(sin(3.14159 * y), 0.7) * (1.0 - 0.4 * y);
  vec2 cell = floor(vGrassPetal * vec2(12.0, 56.0)) + floor(vGrassRoll * 97.0);
  float grain = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float ridge = sin(vGrassPetal.y * 56.0 + vGrassRoll * 20.0);
  float halfWidth = mix(disc, tear * (1.0 - 0.4 * grain) + ridge * 0.02, spike);
  if (abs(petal.x) > halfWidth) discard;
  grassColor = mix(uFlowerColor, uFlowerColor2, step(0.5, fract(vGrassRoll * 7.31)));
  float blossomShade = mix(0.55, 1.0, smoothstep(0.0, 0.3, length(petal)));
  float core = 1.0 - abs(petal.x) / max(halfWidth, 1e-3);
  float spikeShade = mix(0.7, 1.08, y) * (0.9 + 0.1 * ridge) * mix(0.78, 1.04, core) * (0.92 + 0.12 * grain);
  grassColor *= mix(blossomShade, spikeShade, uPattern.z);
} else {
  float roll2 = fract(vGrassRoll * 13.7);
  float roll3 = fract(vGrassRoll * 29.3);
  vec3 tip = vGrassKind > 0.5 ? uMixColor : uTipColor;
  float center = mix(0.1, 0.95, uTone.x);
  grassColor = mix(uBaseColor, tip, smoothstep(center - 0.35, center + 0.35, vGrassT));
  grassColor = jgHueShift(grassColor, (roll2 - 0.5) * uNoise.x * 0.6);
  grassColor *= 1.0 + (roll3 - 0.5) * uNoise.y * 0.7;
  // Variegation: pale margins along the edges and pale bands across the blade.
  float margin = uPattern.x > 0.0 ? smoothstep(0.44 - uPattern.x * 0.24, 0.48 - uPattern.x * 0.24, abs(vGrassU - 0.5)) : 0.0;
  float band = smoothstep(0.62, 0.7, fract(vGrassT * 4.0 + vGrassRoll * 5.0)) * smoothstep(0.08, 0.25, vGrassT) * uPattern.y;
  grassColor = mix(grassColor, uPatternColor, clamp(max(margin, band), 0.0, 1.0) * 0.85);
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
  // The lower blade sits in the sward's own shade, the same for every blade, so a dense field
  // reads deep from above without any one blade standing out as a dark spot.
  grassColor *= mix(0.7, 1.0, smoothstep(0.05, 0.7, vGrassT));
}
grassColor = mix(grassColor, uGroundColor * 1.04, vGrassFade * 0.55);
diffuseColor.rgb = grassColor;
`;

// A blade is one double-sided strip whose normal leans toward the sky (normalLift). three.js turns a
// back face by negating the whole normal, which points that lift into the ground and leaves every
// blade seen from behind near black, so a field reads as dark and pale blades in alternating spots.
// A blade side never faces the ground: whichever side is seen keeps its across-blade direction and
// has its vertical part mirrored up, so both sides of a blade, upright or drooped, catch the sky.
const NORMAL_BEGIN = /* glsl */ `
#include <normal_fragment_begin>
vec3 jgUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
normal = normalize(normal - 2.0 * min(dot(normal, jgUp), 0.0) * jgUp);
nonPerturbedNormal = normal;
`;

const LIGHT_END = /* glsl */ `
#include <lights_fragment_end>
// Warm tip glow where sun shines through the blades, scaled by direct light; no extra lights.
float jgTipMask = smoothstep(0.55, 1.0, vGrassT) * step(vGrassKind, 1.5);
float jgLit = clamp(dot(reflectedLight.directDiffuse, vec3(0.3333)) * 1.6, 0.0, 1.0);
reflectedLight.directDiffuse += vec3(0.34, 0.28, 0.12) * jgTipMask * jgLit * uLight.x * (1.0 - vGrassFade * 0.7);
`;

/**
 * Write a look's wind numbers into the material's wind uniforms (each frame, for a patch in a shared wind).
 * @internal
 */
export function setGrassWindUniforms(uniforms: Pick<GrassShaderUniforms, "uWind" | "uWindDirection">, look: GrassWindLook & Pick<GrassBlade, "stiffness">): void {
  const heading = (look.windDirection * Math.PI) / 180;
  const softness = 1.25 - look.stiffness;
  uniforms.uWind.value.set(look.windStrength * 0.6 * softness, look.windSpeed, 0.04 + (1 - look.windGust) * 0.02 + look.windGust * 0.5, look.windStrength * 0.18 * softness);
  uniforms.uWindDirection.value.set(Math.cos(heading), Math.sin(heading));
}

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
    uShape: { value: new THREE.Vector4(look.blade.profile, look.style.normalLift, look.blade.twist, look.blade.fold) },
    uForm: { value: new THREE.Vector4(look.blade.droop, look.wind.lean, look.flowers.headShape, 0) },
    uFlower: { value: look.flowers.flowerSize },
    uBaseColor: { value: base },
    uTipColor: { value: new THREE.Color(look.colour.tipColor) },
    uMixColor: { value: new THREE.Color(look.mix.mixColor) },
    uFlowerColor: { value: new THREE.Color(look.flowers.flowerColor) },
    uFlowerColor2: { value: new THREE.Color(look.flowers.flowerColor2) },
    uGroundColor: { value: groundColor === undefined ? base.clone().multiplyScalar(0.8) : new THREE.Color(groundColor) },
    uTone: { value: new THREE.Vector4(look.colour.gradient, look.season.season, look.season.dryness, look.season.seasonNoise) },
    uNoise: { value: new THREE.Vector2(look.colour.hueNoise, look.colour.valueNoise) },
    uLight: { value: new THREE.Vector2(look.lighting.translucency, 0) },
    uStripe: { value: new THREE.Vector4(look.mowing.stripeWidth, look.mowing.stripeContrast, Math.cos(stripeHeading), Math.sin(stripeHeading)) },
    uPattern: { value: new THREE.Vector4(look.colour.variegation, look.colour.banding, look.flowers.headShape, 0) },
    uPatternColor: { value: new THREE.Color(look.colour.variegationColor) },
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
      .replace("#include <normal_fragment_begin>", NORMAL_BEGIN)
      .replace("#include <lights_fragment_end>", LIGHT_END);
  };
  material.customProgramCacheKey = () => "jgengine-grass";
  const tallest = look.blade.bladeHeight * Math.max(1, look.mix.mixShare > 0 ? look.mix.mixHeight : 1);
  return { material, uniforms, windReach: (strength + flutter) * 2.2 + 0.05 + look.wind.lean * tallest * 0.9 };
}
