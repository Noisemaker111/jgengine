import * as THREE from "three";
import { FullScreenQuad, Pass } from "three-stdlib";

import type { AtmosphereConfig } from "@jgengine/core/render/postProcessing";

import { windClock, windDirection, windGust } from "@jgengine/core/model/modelWind.draw";
import { findKeyLight, towardLight } from "./contactShadowPass.draw";
import { visitVisible } from "@jgengine/core/visibility/visitVisible.draw";

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
export function atmosphereFragment(steps: number, variationTaps = 0): string {
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
  uniform int uLampCount;
  uniform vec3 uLampPosition[${MAX_HAZE_LAMPS}];
  uniform vec3 uLampColor[${MAX_HAZE_LAMPS}];
  uniform vec4 uLampSpot[${MAX_HAZE_LAMPS}];
  uniform vec2 uLampShape[${MAX_HAZE_LAMPS}];
  uniform float uLampStrength;
  uniform float uBeams;
  uniform float uVariation;
  uniform float uPatch;
  uniform vec2 uDrift;
  varying vec2 vUv;

  float bankNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
    float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
    float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
    float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Mean bank thickness along the first 300 units of the view ray, 0..2 around 1, riding the wind.
  float bankDensity(vec3 origin, vec3 dir, float dist) {
    ${variationTaps <= 0 ? "return 1.0;" : `float reach = min(dist, 300.0);
    float sum = 0.0;
    for (int k = 0; k < ${variationTaps}; k++) {
      vec3 at = origin + dir * reach * ((float(k) + 0.5) / ${variationTaps.toFixed(1)});
      vec2 q = (at.xz - uDrift) * uPatch;
      sum += bankNoise(q) * 0.65 + bankNoise(q * 2.7 + 13.1) * 0.35;
    }
    return mix(1.0, 2.0 * sum / ${variationTaps.toFixed(1)}, uVariation);`}
  }

  vec3 viewPosition(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uProjectionInverse * clip;
    return view.xyz / view.w;
  }

  // Light a lamp scatters toward the eye along the first dist units of the view ray: the closed-form
  // integral of an inverse-square point light, softened by soft so the ray through the bulb stays finite.
  float lampScatter(vec3 origin, vec3 dir, float dist, vec3 lamp, float soft) {
    vec3 toLamp = lamp - origin;
    float t0 = dot(toLamp, dir);
    float h = sqrt(max(dot(toLamp, toLamp) - t0 * t0, 0.0) + soft * soft);
    return (atan((dist - t0) / h) - atan(-t0 / h)) / h;
  }

  float spotCone(vec3 origin, vec3 dir, float dist, vec3 lamp, vec4 spot) {
    if (spot.w <= -1.5) return 1.0;
    vec3 toLamp = lamp - origin;
    float t0 = clamp(dot(toLamp, dir), 0.0, dist);
    float h = length(toLamp - dir * t0) + 0.25;
    float cone = 0.0;
    for (int k = 0; k < 4; k++) {
      float t = clamp(t0 + h * (float(k) - 1.5), 0.0, dist);
      vec3 fromLamp = normalize(origin + dir * t - lamp);
      cone += smoothstep(spot.w, mix(spot.w, 1.0, 0.35), dot(fromLamp, spot.xyz));
    }
    return cone * 0.25;
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
      amount *= bankDensity(uCameraPosition, dir, dist);
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
    vec3 glow = vec3(0.0);
    if (uLampStrength > 0.0 && uFogDensity > 0.0) {
      float reach = sky ? 60.0 : dist;
      for (int i = 0; i < ${MAX_HAZE_LAMPS}; i++) {
        if (i >= uLampCount) break;
        vec3 lamp = uLampPosition[i];
        float range = uLampShape[i].x;
        vec3 toLamp = lamp - uCameraPosition;
        float closest = length(toLamp - dir * clamp(dot(toLamp, dir), 0.0, reach));
        // A halo, not a wash: the glow dies off within about a fifth of the light's range of the ray.
        // A spot with beams on reaches further, and its cone keeps that glow a shaft, not a cloud.
        bool spot = uLampSpot[i].w > -1.5;
        float spread = (range > 0.0 ? range : 20.0) * (spot ? 0.2 + 0.45 * uBeams : 0.2);
        float window = exp(-(closest * closest) / (2.0 * spread * spread));
        if (window < 0.01) continue;
        float density = uFogDensity * exp(-uFogFalloff * (lamp.y - uFogHeight));
        float scatter = lampScatter(uCameraPosition, dir, reach, lamp, uLampShape[i].y);
        glow += uLampColor[i] * scatter * density * window * spotCone(uCameraPosition, dir, reach, lamp, uLampSpot[i]) * (spot ? 1.0 + uBeams : 1.0);
      }
      // Isotropic phase (1 / 4pi); the strength knob lets a game push a smoky interior further.
      glow *= uLampStrength * 0.0796;
    }
    gl_FragColor = vec4(haze * cover + shafts + glow, cover);
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
/** Point and spot lights the haze glows around at once, nearest the camera first. */
export const MAX_HAZE_LAMPS = 8;
const lampWorld = new THREE.Vector3();
const lampTarget = new THREE.Vector3();

/** A local light the haze can glow around. @internal */
export type HazeLamp = THREE.PointLight | THREE.SpotLight;

/** Every visible point or spot light in `scene` that may glow in the haze. @internal */
export function findHazeLamps(scene: THREE.Object3D): HazeLamp[] {
  const lamps: HazeLamp[] = [];
  visitVisible(scene, (object) => {
    const light = object as HazeLamp;
    if (!(light as THREE.PointLight).isPointLight && !(light as THREE.SpotLight).isSpotLight) return;
    if (light.userData?.["haze"] === false) return;
    lamps.push(light);
  });
  return lamps;
}

/**
 * The lit lamps nearest `eye`, nearest first and at most {@link MAX_HAZE_LAMPS}; a dark lamp or one
 * further away than three times its own range is skipped. @internal
 */
export function nearestHazeLamps(lamps: readonly HazeLamp[], eye: THREE.Vector3): HazeLamp[] {
  const lit: { lamp: HazeLamp; distance: number }[] = [];
  for (const lamp of lamps) {
    if (lamp.intensity <= 0 || lamp.parent === null || !lamp.visible) continue;
    lamp.getWorldPosition(lampWorld);
    const distance = lampWorld.distanceTo(eye);
    if (lamp.distance > 0 && distance > lamp.distance * 3) continue;
    lit.push({ lamp, distance });
  }
  lit.sort((a, b) => a.distance - b.distance);
  return lit.slice(0, MAX_HAZE_LAMPS).map((entry) => entry.lamp);
}
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
 * frame. With no shadow-casting sun it is skipped, unless the config is `indoor`: then the shafts drop
 * out and the haze and lamp glow keep running.
 * @internal
 */
export class AtmospherePass extends Pass {
  readonly material: THREE.ShaderMaterial;
  readonly applyMaterial: THREE.ShaderMaterial;
  readonly target: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly applyQuad: FullScreenQuad;
  private light: THREE.DirectionalLight | null = null;
  private lamps: HazeLamp[] = [];
  private framesSinceScan = LIGHT_RESCAN_FRAMES;
  private frame = 0;
  private aspect = 1;
  private readonly indoor: boolean;
  private readonly tint: THREE.Color | null;
  private readonly drift: number;
  private driftClock = Number.NaN;
  private readonly driftOffset = new THREE.Vector2();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    depth: THREE.DepthTexture,
    settings: Required<AtmosphereConfig>,
    steps: number,
    variationTaps = 0,
  ) {
    super();
    this.needsSwap = false;
    this.indoor = settings.indoor;
    this.tint = settings.color === "" ? null : new THREE.Color(settings.color);
    this.drift = settings.drift;
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
        uLampCount: { value: 0 },
        uLampPosition: { value: Array.from({ length: MAX_HAZE_LAMPS }, () => new THREE.Vector3()) },
        uLampColor: { value: Array.from({ length: MAX_HAZE_LAMPS }, () => new THREE.Vector3()) },
        uLampSpot: { value: Array.from({ length: MAX_HAZE_LAMPS }, () => new THREE.Vector4(0, 0, 0, -2)) },
        uLampShape: { value: Array.from({ length: MAX_HAZE_LAMPS }, () => new THREE.Vector2()) },
        uLampStrength: { value: settings.lamps },
        uBeams: { value: Math.min(1, Math.max(0, settings.beams)) },
        uVariation: { value: Math.min(1, Math.max(0, settings.variation)) },
        uPatch: { value: 1 / Math.max(1, settings.patchSize) },
        uDrift: { value: this.driftOffset },
      },
      vertexShader,
      fragmentShader: atmosphereFragment(Math.max(1, steps), settings.variation > 0 ? variationTaps : 0),
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
    // A lamp taken out of the scene means its pool was swapped (a new floor, a remounted rig): look
    // again now, so the replacements glow on their first frame instead of up to a rescan later.
    const lost = (this.light !== null && (this.light.parent === null || !this.light.castShadow)) || this.lamps.some((lamp) => lamp.parent === null);
    if (lost || this.framesSinceScan >= LIGHT_RESCAN_FRAMES) {
      this.light = findKeyLight(this.scene);
      this.lamps = this.material.uniforms["uLampStrength"]!.value > 0 ? findHazeLamps(this.scene) : [];
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
    if (light === null && !this.indoor) return;
    const uniforms = this.material.uniforms;
    // No sun indoors: the haze and the lamp glow still run, the shafts and the sun's warmth do not.
    const sun = light === null ? (uniforms["uSunDirection"]!.value as THREE.Vector3).set(0, 1, 0) : towardLight(light, uniforms["uSunDirection"]!.value as THREE.Vector3);
    if (light === null) (uniforms["uSunColor"]!.value as THREE.Color).setRGB(0, 0, 0);
    else (uniforms["uSunColor"]!.value as THREE.Color).copy(light.color).multiplyScalar(Math.min(light.intensity, 3) * 0.35);
    const fog = this.scene.fog;
    const background = this.scene.background;
    (uniforms["uFogColor"]!.value as THREE.Color).copy(
      this.tint ?? (fog !== null ? fog.color : background instanceof THREE.Color ? background : FALLBACK_FOG),
    );
    this.advanceDrift(this.driftOffset);
    (uniforms["uProjectionInverse"]!.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    (uniforms["uCameraWorld"]!.value as THREE.Matrix4).copy(this.camera.matrixWorld);
    const cameraPosition = (uniforms["uCameraPosition"]!.value as THREE.Vector3).setFromMatrixPosition(this.camera.matrixWorld);

    sunPoint.copy(sun).multiplyScalar(1000).add(cameraPosition);
    viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    projected.set(sunPoint.x, sunPoint.y, sunPoint.z, 1).applyMatrix4(viewProjection);
    const inFront = projected.w > 0;
    const sunUv = uniforms["uSunUv"]!.value as THREE.Vector2;
    if (inFront) sunUv.set((projected.x / projected.w) * 0.5 + 0.5, (projected.y / projected.w) * 0.5 + 0.5);
    uniforms["uSunVisible"]!.value = light === null ? 0 : sunShaftVisibility(sunUv, inFront, sun.y);
    this.writeLamps(cameraPosition);
    uniforms["uAspect"]!.value = this.aspect;
    this.frame = (this.frame + 1) % 64;
    uniforms["uFrame"]!.value = this.frame;

    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    this.applyQuad.render(renderer);
    renderer.autoClear = autoClear;
  }

  /** Move the haze banks downwind by the time the shared wind clock moved, scaled by the gust. */
  private advanceDrift(offset: THREE.Vector2): void {
    const now = windClock.value;
    const step = Number.isNaN(this.driftClock) ? 0 : Math.min(0.25, Math.max(0, now - this.driftClock));
    this.driftClock = now;
    if (this.drift === 0 || step === 0) return;
    const travel = this.drift * windGust.value * step;
    offset.x += windDirection.x * travel;
    offset.y += windDirection.y * travel;
    // Kept small so the noise lattice keeps its float precision over a long session.
    if (Math.abs(offset.x) > 1e5 || Math.abs(offset.y) > 1e5) offset.set(offset.x % 1e4, offset.y % 1e4);
  }

  private writeLamps(eye: THREE.Vector3): void {
    const uniforms = this.material.uniforms;
    const nearest = this.lamps.length === 0 ? [] : nearestHazeLamps(this.lamps, eye);
    const positions = uniforms["uLampPosition"]!.value as THREE.Vector3[];
    const colors = uniforms["uLampColor"]!.value as THREE.Vector3[];
    const spots = uniforms["uLampSpot"]!.value as THREE.Vector4[];
    const shapes = uniforms["uLampShape"]!.value as THREE.Vector2[];
    nearest.forEach((lamp, index) => {
      lamp.getWorldPosition(positions[index]!);
      colors[index]!.set(lamp.color.r, lamp.color.g, lamp.color.b).multiplyScalar(lamp.intensity);
      shapes[index]!.set(lamp.distance, 0.18);
      if ((lamp as THREE.SpotLight).isSpotLight) {
        const spot = lamp as THREE.SpotLight;
        spot.target.getWorldPosition(lampTarget);
        lampTarget.sub(positions[index]!).normalize();
        spots[index]!.set(lampTarget.x, lampTarget.y, lampTarget.z, Math.cos(spot.angle));
      } else spots[index]!.set(0, 0, 0, -2);
    });
    uniforms["uLampCount"]!.value = nearest.length;
  }

  override dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.applyMaterial.dispose();
    this.quad.dispose();
    this.applyQuad.dispose();
  }
}
