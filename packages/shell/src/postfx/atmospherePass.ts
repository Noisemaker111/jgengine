import * as THREE from "three";
import { FullScreenQuad, Pass } from "three-stdlib";

import type { AtmosphereConfig } from "@jgengine/core/render/postProcessing";

import { findKeyLight, towardLight } from "./contactShadowPass";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Height haze plus light shafts in one full-screen pass. Writes premultiplied haze-and-shaft light in
 * rgb and the haze cover in alpha, so one blended draw composites it over the frame.
 * @internal
 */
export function atmosphereFragment(steps: number): string {
  return /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProjectionInverse;
  uniform mat4 uCameraWorld;
  uniform vec3 uCameraPosition;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uFogFalloff;
  uniform float uFogHeight;
  uniform float uFogMax;
  uniform float uShafts;
  uniform vec2 uSunUv;
  uniform float uSunVisible;
  uniform float uAspect;
  uniform float uFrame;
  varying vec2 vUv;

  vec3 viewPosition(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uProjectionInverse * clip;
    return view.xyz / view.w;
  }

  float interleavedNoise(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    float depth = texture2D(tDepth, vUv).x;
    bool sky = depth >= 0.99999;
    vec3 world = (uCameraWorld * vec4(viewPosition(vUv, sky ? 0.999 : depth), 1.0)).xyz;
    vec3 ray = world - uCameraPosition;
    float dist = length(ray);
    vec3 dir = ray / max(dist, 1e-4);

    float cover = 0.0;
    if (!sky && uFogDensity > 0.0) {
      // Exponential height fog integrated along the view ray: dense at the ground, thin overhead.
      float start = uFogDensity * exp(-uFogFalloff * (uCameraPosition.y - uFogHeight));
      float rise = uFogFalloff * dir.y * dist;
      float amount = abs(rise) > 1e-4 ? start * dist * (1.0 - exp(-rise)) / rise : start * dist;
      cover = min(1.0 - exp(-max(amount, 0.0)), uFogMax);
    }
    float towardSun = max(dot(dir, uSunDirection), 0.0);
    vec3 haze = uFogColor + uSunColor * (pow(towardSun, 8.0) * 0.6 + pow(towardSun, 48.0) * 0.8);

    vec3 shafts = vec3(0.0);
    if (uShafts > 0.0 && uSunVisible > 0.0) {
      // March toward the sun on screen; open sky near the sun lets light through, geometry blocks it.
      vec2 delta = (uSunUv - vUv) / ${steps.toFixed(1)};
      vec2 uv = vUv + delta * interleavedNoise(gl_FragCoord.xy + uFrame * 5.588238);
      float light = 0.0;
      float weight = 1.0;
      for (int i = 0; i < ${steps}; i++) {
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
        float open = step(0.99999, texture2D(tDepth, uv).x);
        vec2 fromSun = (uv - uSunUv) * vec2(uAspect, 1.0);
        light += open * (1.0 - smoothstep(0.0, 0.6, length(fromSun))) * weight;
        weight *= 0.95;
        uv += delta;
      }
      shafts = uSunColor * (light / ${steps.toFixed(1)}) * uShafts * uSunVisible * 3.0;
    }
    gl_FragColor = vec4(haze * cover + shafts, cover);
  }
`;
}

const applyFragment = /* glsl */ `
  uniform sampler2D tAtmosphere;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tAtmosphere, vUv);
  }
`;

const LIGHT_RESCAN_FRAMES = 90;
const FALLBACK_FOG = new THREE.Color(0.62, 0.7, 0.78);
const sunPoint = new THREE.Vector3();
const projected = new THREE.Vector4();
const viewProjection = new THREE.Matrix4();

/**
 * How strongly shafts show for a sun at `uv` on screen, given whether it is in front of the camera
 * and its height: full on screen, fading out beyond the edges, off behind the camera or below the
 * horizon. @internal
 */
export function sunShaftVisibility(uv: { x: number; y: number }, inFront: boolean, sunHeight: number): number {
  if (!inFront) return 0;
  const outside = Math.max(0, -uv.x, uv.x - 1, -uv.y, uv.y - 1);
  const edge = Math.max(0, 1 - outside / 0.35);
  const height = Math.min(1, Math.max(0, (sunHeight + 0.05) / 0.15));
  return edge * height;
}

/**
 * Sunlit air over the lit HDR frame: exponential height haze that fades distant ground into the sky
 * and brightens toward the sun, plus screen-space shafts where the sky shows through gaps. It reads
 * the beauty depth, so like contact shadows it draws into a target of its own and blends that over the
 * frame. Skipped while the scene has no shadow-casting sun, so interiors keep their own air.
 * @internal
 */
export class AtmospherePass extends Pass {
  readonly material: THREE.ShaderMaterial;
  readonly applyMaterial: THREE.ShaderMaterial;
  readonly target: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly applyQuad: FullScreenQuad;
  private light: THREE.DirectionalLight | null = null;
  private framesSinceScan = LIGHT_RESCAN_FRAMES;
  private frame = 0;
  private aspect = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    depth: THREE.DepthTexture,
    settings: Required<AtmosphereConfig>,
    steps: number,
  ) {
    super();
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: depth },
        uProjectionInverse: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Matrix4() },
        uCameraPosition: { value: new THREE.Vector3() },
        uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uFogColor: { value: FALLBACK_FOG.clone() },
        uFogDensity: { value: settings.fogDensity },
        uFogFalloff: { value: Math.max(1e-4, settings.fogFalloff) },
        uFogHeight: { value: settings.fogHeight },
        uFogMax: { value: settings.fogMax },
        uShafts: { value: settings.shafts },
        uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
        uSunVisible: { value: 0 },
        uAspect: { value: 1 },
        uFrame: { value: 0 },
      },
      vertexShader,
      fragmentShader: atmosphereFragment(Math.max(1, steps)),
      depthTest: false,
      depthWrite: false,
    });
    this.applyMaterial = new THREE.ShaderMaterial({
      uniforms: { tAtmosphere: { value: this.target.texture } },
      vertexShader,
      fragmentShader: applyFragment,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.quad = new FullScreenQuad(this.material);
    this.applyQuad = new FullScreenQuad(this.applyMaterial);
  }

  private keyLight(): THREE.DirectionalLight | null {
    this.framesSinceScan += 1;
    const lost = this.light !== null && (this.light.parent === null || !this.light.castShadow);
    if (lost || this.framesSinceScan >= LIGHT_RESCAN_FRAMES) {
      this.light = findKeyLight(this.scene);
      this.framesSinceScan = 0;
    }
    return this.light;
  }

  override setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    this.aspect = width / Math.max(1, height);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const light = this.keyLight();
    if (light === null) return;
    const uniforms = this.material.uniforms;
    const sun = towardLight(light, uniforms.uSunDirection!.value as THREE.Vector3);
    (uniforms.uSunColor!.value as THREE.Color).copy(light.color).multiplyScalar(Math.min(light.intensity, 3) * 0.35);
    const fog = this.scene.fog;
    const background = this.scene.background;
    (uniforms.uFogColor!.value as THREE.Color).copy(
      fog !== null ? fog.color : background instanceof THREE.Color ? background : FALLBACK_FOG,
    );
    (uniforms.uProjectionInverse!.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    (uniforms.uCameraWorld!.value as THREE.Matrix4).copy(this.camera.matrixWorld);
    const cameraPosition = (uniforms.uCameraPosition!.value as THREE.Vector3).setFromMatrixPosition(this.camera.matrixWorld);

    sunPoint.copy(sun).multiplyScalar(1000).add(cameraPosition);
    viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    projected.set(sunPoint.x, sunPoint.y, sunPoint.z, 1).applyMatrix4(viewProjection);
    const inFront = projected.w > 0;
    const sunUv = uniforms.uSunUv!.value as THREE.Vector2;
    if (inFront) sunUv.set((projected.x / projected.w) * 0.5 + 0.5, (projected.y / projected.w) * 0.5 + 0.5);
    uniforms.uSunVisible!.value = sunShaftVisibility(sunUv, inFront, sun.y);
    uniforms.uAspect!.value = this.aspect;
    this.frame = (this.frame + 1) % 64;
    uniforms.uFrame!.value = this.frame;

    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    this.applyQuad.render(renderer);
    renderer.autoClear = autoClear;
  }

  override dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.applyMaterial.dispose();
    this.quad.dispose();
    this.applyQuad.dispose();
  }
}
