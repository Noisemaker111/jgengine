import * as THREE from "three";
import { ShaderPass } from "three-stdlib";

import type { GradeConfig, LutCube } from "@jgengine/core/render/postProcessing";

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
  uniform sampler2D uLut;
  uniform float uLutSize;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 sampleLut(vec3 color) {
    float size = max(uLutSize, 2.0);
    float levels = size - 1.0;
    vec3 c = clamp(color, 0.0, 1.0) * levels;
    // One tile per blue slice, sampled at texel centres so linear filtering never reads across
    // into the neighbouring slice, and the two nearest slices blend the blue axis by hand.
    float slice = floor(c.b);
    float next = min(slice + 1.0, levels);
    vec2 uvA = vec2((slice * size + 0.5 + c.r) / (size * size), (0.5 + c.g) / size);
    vec2 uvB = vec2((next * size + 0.5 + c.r) / (size * size), (0.5 + c.g) / size);
    return mix(texture2D(uLut, uvA).rgb, texture2D(uLut, uvB).rgb, c.b - slice);
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
    if (uLutSize > 1.0) c = sampleLut(c);
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

/** Packs a baked cube into the strip layout the sampler expects: `size` tiles side by side per blue slice. */
function lutStripTexture(cube: LutCube): THREE.DataTexture {
  const size = cube.size;
  const data = new Uint8Array(size * size * size * 4);
  for (let slice = 0; slice < size; slice += 1) {
    for (let green = 0; green < size; green += 1) {
      for (let red = 0; red < size; red += 1) {
        const from = (slice * size * size + green * size + red) * 3;
        const to = (green * size * size + slice * size + red) * 4;
        data[to] = cube.data[from] ?? 0;
        data[to + 1] = cube.data[from + 1] ?? 0;
        data[to + 2] = cube.data[from + 2] ?? 0;
        data[to + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(data, size * size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  // Display-space values sampled raw in the shader, so no colour-space decode on the way in.
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/** Build the display-space colour-grade pass and load its optional LUT. Dispose the pass to release its LUT; advance `uniforms.uTime.value` each frame to animate grain. */
export function createGradePass(config: GradeConfig = {}): ShaderPass {
  const lift = config.lift ?? DEFAULT_LIFT;
  const gain = config.gain ?? DEFAULT_GAIN;
  const pass = new ShaderPass({
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
      uLut: { value: null },
      uLutSize: { value: 0 },
    },
    vertexShader,
    fragmentShader,
  });
  let disposed = false;
  let lutTexture: THREE.Texture | null = null;
  const dispose = pass.dispose.bind(pass);
  pass.dispose = () => {
    if (disposed) return;
    disposed = true;
    lutTexture?.dispose();
    lutTexture = null;
    dispose();
  };
  if (config.lut !== undefined) {
    const lut = config.lut;
    if ("cube" in lut) {
      lutTexture = lutStripTexture(lut.cube);
      pass.uniforms.uLut.value = lutTexture;
      pass.uniforms.uLutSize.value = lut.cube.size;
      return pass;
    }
    void new THREE.TextureLoader().loadAsync(lut.url).then((texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      lutTexture = texture;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      pass.uniforms.uLut.value = texture;
      pass.uniforms.uLutSize.value = lut.size ?? 32;
    }).catch(() => undefined);
  }
  return pass;
}
