import * as THREE from "three";

/** A rotated rectangle on the ground (world XZ) whose rim ground layers fade out toward. */
export interface GroundEdgeFadeRect {
  centerX: number;
  centerZ: number;
  /** Half size along the rectangle's local X and Z, in metres. */
  halfX: number;
  halfZ: number;
  /** Same convention as a city volume's `rotationY`: local = (dx·cos − dz·sin, dx·sin + dz·cos). */
  rotationY: number;
  /** Metres inside the rim over which ground goes from clear to opaque. */
  width: number;
}

/** Shared uniforms for {@link applyGroundEdgeFade}; `set` retargets every material using them without a recompile. */
export interface GroundEdgeFade {
  readonly uniforms: {
    uJgFadeCenter: { value: THREE.Vector2 };
    uJgFadeHalf: { value: THREE.Vector2 };
    uJgFadeRot: { value: THREE.Vector2 };
    uJgFadeWidth: { value: number };
  };
  set(rect: GroundEdgeFadeRect): void;
}

/** Default fade band for a rectangle: 8 m, never more than 30% of its shorter half size. */
export function groundEdgeFadeWidth(halfX: number, halfZ: number): number {
  return Math.max(0.5, Math.min(8, Math.min(halfX, halfZ) * 0.3));
}

/** Uniforms for one faded rectangle, shared by every ground material of one district. */
export function createGroundEdgeFade(rect: GroundEdgeFadeRect): GroundEdgeFade {
  const uniforms = {
    uJgFadeCenter: { value: new THREE.Vector2() },
    uJgFadeHalf: { value: new THREE.Vector2() },
    uJgFadeRot: { value: new THREE.Vector2() },
    uJgFadeWidth: { value: 1 },
  };
  const fade: GroundEdgeFade = {
    uniforms,
    set(next) {
      uniforms.uJgFadeCenter.value.set(next.centerX, next.centerZ);
      uniforms.uJgFadeHalf.value.set(Math.max(0, next.halfX), Math.max(0, next.halfZ));
      uniforms.uJgFadeRot.value.set(Math.cos(next.rotationY), Math.sin(next.rotationY));
      uniforms.uJgFadeWidth.value = Math.max(1e-3, next.width);
    },
  };
  fade.set(rect);
  return fade;
}

const FADE_FRAGMENT_GLSL = /* glsl */ `
{
  vec2 jgFadeD = vJgFadePos - uJgFadeCenter;
  vec2 jgFadeL = vec2(jgFadeD.x * uJgFadeRot.x - jgFadeD.y * uJgFadeRot.y, jgFadeD.x * uJgFadeRot.y + jgFadeD.y * uJgFadeRot.x);
  vec2 jgFadeIn = uJgFadeHalf - abs(jgFadeL);
  float jgFadeDist = min(jgFadeIn.x, jgFadeIn.y);
  // Two octaves of value noise keep the rim from reading as a ruled line.
  float jgFadeN = jgFadeNoise(vJgFadePos / max(1.0, uJgFadeWidth * 0.9)) * 0.7 + jgFadeNoise(vJgFadePos / max(0.5, uJgFadeWidth * 0.25) + 17.3) * 0.3 - 0.5;
  float jgFadeT = (jgFadeDist - uJgFadeWidth * 0.15 + jgFadeN * uJgFadeWidth * 0.35) / (uJgFadeWidth * 0.7);
  diffuseColor.a *= smoothstep(0.0, 1.0, jgFadeT);
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
 * Fade a ground material out toward the rim of a rectangle: fully clear on the rim, opaque
 * `width` metres inside it, with a noise-broken line. Edges between layers inside the rectangle
 * are untouched, so a district's ground keeps crisp road/plaza seams while its outer boundary melts
 * into the terrain. Turns on blending (depth writes stay on); give stacked layers ascending
 * `renderOrder` so lower ones draw first. Chains any existing `onBeforeCompile`, so it composes
 * with `createSurfaceRibbonMaterial` and plain `MeshStandardMaterial`s alike.
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
uniform vec2 uJgFadeCenter;
uniform vec2 uJgFadeHalf;
uniform vec2 uJgFadeRot;
uniform float uJgFadeWidth;
${FADE_NOISE_GLSL}`,
      )
      .replace("#include <alphamap_fragment>", `#include <alphamap_fragment>\n${FADE_FRAGMENT_GLSL}`);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}-jgedgefade`;
  material.needsUpdate = true;
  return material;
}
