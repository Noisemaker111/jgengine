import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

import type { ModelWindConfig } from "@jgengine/core/game/playableGame";

/** Shared gust clock every foliage material reads; advanced once per frame by `WindClock`. */
export const windClock = { value: 0 };
/** Shared gust direction (XZ); a model may override it with its own authored direction. */
export const windDirection = new THREE.Vector2(1, 0.35).normalize();

const WIND_KEY = "jgWind";

/** Resolved sway settings baked into one material. */
export interface ResolvedModelWind {
  strength: number;
  speed: number;
  height: number;
  direction: THREE.Vector2;
}

/** Fully-defaulted sway settings for a model. @internal */
export function resolveModelWind(wind: ModelWindConfig | false | undefined, fallbackHeight: number): ResolvedModelWind | null {
  if (wind === false || wind === undefined) return null;
  const strength = wind.strength ?? 0.35;
  if (!Number.isFinite(strength) || strength < 0) throw new Error("Model wind strength must be finite and non-negative");
  const speed = wind.speed ?? 1;
  if (!Number.isFinite(speed) || speed <= 0) throw new Error("Model wind speed must be finite and positive");
  const height = wind.height ?? fallbackHeight;
  if (!Number.isFinite(height) || height <= 0) throw new Error("Model wind height must be finite and positive");
  const direction = new THREE.Vector2(wind.direction?.[0] ?? windDirection.x, wind.direction?.[1] ?? windDirection.y);
  if (direction.lengthSq() === 0) direction.set(1, 0);
  direction.normalize();
  return { strength, speed, height, direction };
}

const VERTEX_PARS = /* glsl */ `
uniform float uJgWindTime;
uniform vec2 uJgWindDir;
uniform float uJgWindStrength;
uniform float uJgWindSpeed;
uniform float uJgWindHeight;`;

// Height-ramped sway in object space, phased by the instance's world position so neighbouring
// plants move on different gusts. Trunks (low vertices) barely move; fronds ride the full travel.
const VERTEX_SWAY = /* glsl */ `#include <begin_vertex>
{
  float jgWindT = clamp(position.y / max(uJgWindHeight, 0.001), 0.0, 1.0);
  float jgWindRamp = jgWindT * jgWindT;
  #ifdef USE_INSTANCING
    vec3 jgWindWorld = (instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vec3 jgWindWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
  float jgWindPhase = dot(jgWindWorld.xz, vec2(0.17, 0.13)) + uJgWindTime * uJgWindSpeed;
  float jgWindGust = sin(jgWindPhase) * 0.6 + sin(jgWindPhase * 0.47 + 2.3) * 0.4;
  float jgWindFlutter = sin(uJgWindTime * 6.3 + jgWindWorld.x * 0.9 + jgWindWorld.z * 1.3) * 0.18;
  vec2 jgWindPush = uJgWindDir * (jgWindGust + jgWindFlutter) * uJgWindStrength * jgWindRamp;
  transformed.x += jgWindPush.x;
  transformed.z += jgWindPush.y;
}`;

/**
 * Compiles height-ramped wind sway into a standard material's vertex shader. Idempotent per
 * material; the clock and direction are shared module uniforms, so the whole scene advances with
 * one write per frame and no per-material bookkeeping.
 * @capability model-wind sway a foliage model in the shared gust field
 */
export function applyModelWind(material: THREE.MeshStandardMaterial, wind: ResolvedModelWind): THREE.MeshStandardMaterial {
  if (material.userData[WIND_KEY] !== undefined) return material;
  const uniforms = {
    uJgWindTime: windClock,
    uJgWindDir: { value: wind.direction.clone() },
    uJgWindStrength: { value: wind.strength },
    uJgWindSpeed: { value: wind.speed },
    uJgWindHeight: { value: wind.height },
  };
  material.userData[WIND_KEY] = uniforms;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace("#include <begin_vertex>", VERTEX_SWAY);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}|jg-wind:v1`;
  material.needsUpdate = true;
  return material;
}

/** Applies wind to every standard material under a cloned model. @internal */
export function applyModelWindToScene(root: THREE.Object3D, wind: ModelWindConfig | false | undefined, fallbackHeight = 4): void {
  const resolved = resolveModelWind(wind, fallbackHeight);
  if (resolved === null) return;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true) applyModelWind(material as THREE.MeshStandardMaterial, resolved);
    }
  });
}

/** Advances the shared gust clock once per frame; mount one per 3D world. */
export function WindClock(): null {
  useFrame(({ clock }) => {
    windClock.value = clock.getElapsedTime();
  });
  return null;
}
