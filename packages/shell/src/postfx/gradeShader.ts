import * as THREE from "three";
import { ShaderPass } from "three-stdlib";

import type { GradeConfig } from "@jgengine/core/render/postProcessing";

const DEFAULT_LIFT: readonly [number, number, number] = [0.012, 0.01, 0.018];
const DEFAULT_GAIN: readonly [number, number, number] = [1.05, 1.02, 0.98];
const DEFAULT_GAMMA = 0.96;
const DEFAULT_SATURATION = 1.12;
const DEFAULT_VIGNETTE = 0.2;
const DEFAULT_GRAIN = 0.012;
const DEFAULT_CHROMA = 0;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 uLift;
  uniform vec3 uGain;
  uniform float uGamma;
  uniform float uSaturation;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uChroma;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 dir = vUv - 0.5;
    // Chromatic aberration: split RGB along the radial direction, growing toward the edges.
    vec2 shift = uChroma > 0.0 ? dir * uChroma * dot(dir, dir) * 4.0 : vec2(0.0);
    vec3 c = uChroma > 0.0
      ? vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b)
      : texture2D(tDiffuse, vUv).rgb;
    c = c + uLift;
    c = c * uGain;
    c = pow(max(c, 0.0), vec3(uGamma));
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(luma), c, uSaturation);
    vec2 d = vUv - 0.5;
    float vig = 1.0 - uVignette * smoothstep(0.6, 0.95, dot(d, d) * 2.2);
    c *= vig;
    float g = (hash(vUv + fract(uTime)) - 0.5) * uGrain * 2.0;
    c += g;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Build the display-space colour-grade pass (lift/gain/gamma, saturation, vignette, grain). Advance `uniforms.uTime.value` each frame to animate the grain. */
export function createGradePass(config: GradeConfig = {}): ShaderPass {
  const lift = config.lift ?? DEFAULT_LIFT;
  const gain = config.gain ?? DEFAULT_GAIN;
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uLift: { value: new THREE.Vector3(lift[0], lift[1], lift[2]) },
      uGain: { value: new THREE.Vector3(gain[0], gain[1], gain[2]) },
      uGamma: { value: config.gamma ?? DEFAULT_GAMMA },
      uSaturation: { value: config.saturation ?? DEFAULT_SATURATION },
      uVignette: { value: config.vignette ?? DEFAULT_VIGNETTE },
      uGrain: { value: config.grain ?? DEFAULT_GRAIN },
      uChroma: { value: config.chromaticAberration ?? DEFAULT_CHROMA },
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
  });
}
