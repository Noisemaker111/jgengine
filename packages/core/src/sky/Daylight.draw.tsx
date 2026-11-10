// @skill jgengine-world
import { useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";

import type { BiomeBand, SkyEnvironmentDescriptor } from "@jgengine/core/world/features";
import { createBiomeFogSampler, createBiomeSkySampler } from "@jgengine/core/terrain/terrain";
import { resolveVolumetricClouds } from "@jgengine/core/sky/volumetricClouds";


import { DisplayColorWriter } from "@jgengine/core/render/displayColor.draw";
import type { DaylightModulation } from "@jgengine/core/lighting/SceneLighting.draw";
import {
  bandFogColor,
  daylightStateAt,
  type DaylightState,
  DEFAULT_DAY_AMBIENT_INTENSITY,
  DEFAULT_DAY_SUN_INTENSITY,
  overcastDaylight,
  SKY_PRESET_DAY_FRACTION,
} from "@jgengine/core/sky/daylightCycle";
import { createSkyLight, publishSkyLight, type SkyLight } from "./skyLight.draw";
import { SUN_SHADOW, sunLightPosition, sunShadowFocus } from "./sunShadowMath";
import { volumetricCloudsDraw } from "./VolumetricClouds.draw";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

/** Props for the gradient sky dome: top and horizon colours, dome radius, gradient shape and an optional sun disc. */
export interface SkyDomeProps {
  topColor?: string;
  horizonColor?: string;
  radius?: number;
  offset?: number;
  exponent?: number;
  /** Direction toward the sun; a bright HDR sun disc + warm glow is drawn there (blooms through the post chain). Omit to skip the sun. */
  sunDirection?: readonly [number, number, number];
  /** Sun disc/glow colour. Default warm white. */
  sunColor?: string;
  /** Sun disc/glow intensity multiplier. Default 1. */
  sunIntensity?: number;
  /** Direction toward the moon; a cool disc + halo is drawn there at night. Omit to skip the moon. */
  moonDirection?: readonly [number, number, number];
  /** Moon disc/halo colour. Default cool moonlight. */
  moonColor?: string;
  /** Moon disc/halo intensity multiplier. Default 0 (no moon). */
  moonIntensity?: number;
  /** Star-field opacity: 0 is a day sky, 1 is a clear night. Default 0. */
  starOpacity?: number;
  /** Horizon haze-band strength: 0 removes the dusty band, ~1 makes it heavy. Default 0.5. */
  hazeStrength?: number;
  /** Procedural cloud-band opacity: 0 is a clear sky, 1 is heavy overcast. Default 0.35. */
  cloudiness?: number;
  /** Sun-glow brightness multiplier around the sun disc. Default 1. */
  sunGlowStrength?: number;
  /** Exposes the created shader material so a time-of-day driver can mutate its uniforms per frame without recreating it. */
  materialRef?: MutableRefObject<THREE.ShaderMaterial | null>;
}

function normalizeVec3(v: readonly [number, number, number]): THREE.Vector3 {
  const out = new THREE.Vector3(v[0], v[1], v[2]);
  return out.lengthSq() === 0 ? new THREE.Vector3(0, 1, 0) : out.normalize();
}

const SKY_TOP = "#3fa4f2";
const SKY_HORIZON = "#e3f4ff";
const MOON_COLOR = "#cfdcf2";
const HEMI_SKY = "#bfe3ff";
const HEMI_GROUND = "#4c6b34";

/** Aim the dome's moon disc and dial its brightness; called per frame by the time-of-day drivers. @internal */
export function setSkyMoon(
  material: THREE.ShaderMaterial,
  direction: readonly [number, number, number],
  color: THREE.ColorRepresentation,
  intensity: number,
  starOpacity: number,
): void {
  (material.uniforms["uMoonDirection"]!.value as THREE.Vector3).set(direction[0], direction[1], direction[2]).normalize();
  (material.uniforms["uMoonColor"]!.value as THREE.Color).set(color);
  material.uniforms["uMoonIntensity"]!.value = intensity;
  material.uniforms["uStars"]!.value = starOpacity;
}
/** Props for {@link sunLightDraw}: the light's aim, live direction override, intensity and colour. */
export interface SunLightDrawProps {
  direction: readonly [number, number, number];
  directionRef?: MutableRefObject<readonly [number, number, number]> | undefined;
  lightRef?: RefObject<THREE.DirectionalLight | null> | undefined;
  intensity: number;
  color: string;
  /** Shadow-casting key light. Off for the moon: its light is too weak to read a shadow and a second shadow pass is not free. */
  castShadow?: boolean;
}

/**
 * Draw-side form of {@link SunLight}: a directional light whose shadow box leads the camera each
 * frame ({@link sunShadowFocus}), so grounded shadows stay crisp and soft-edged under the player
 * anywhere in a large world. `directionRef` carries the per-frame aim time-of-day drivers write;
 * `lightRef` exposes the light the same way the JSX ref did.
 */
export function sunLightDraw(getProps: () => SunLightDrawProps): EngineDraw {
  let light: THREE.DirectionalLight | null = null;
  let boundRef: RefObject<THREE.DirectionalLight | null> | undefined;
  const scratch = { forward: new THREE.Vector3(), focus: { x: 0, z: 0 }, position: [0, 0, 0] as [number, number, number] };
  const applyProps = () => {
    if (light === null) return;
    const props = getProps();
    light.intensity = props.intensity;
    light.color.set(props.color);
    light.castShadow = props.castShadow ?? true;
  };
  return {
    mount(state: EngineFrameState) {
      light = new THREE.DirectionalLight();
      const shadow = light.shadow;
      shadow.mapSize.set(SUN_SHADOW.mapSize, SUN_SHADOW.mapSize);
      shadow.camera.left = -SUN_SHADOW.halfExtent;
      shadow.camera.right = SUN_SHADOW.halfExtent;
      shadow.camera.top = SUN_SHADOW.halfExtent;
      shadow.camera.bottom = -SUN_SHADOW.halfExtent;
      shadow.camera.near = SUN_SHADOW.near;
      shadow.camera.far = SUN_SHADOW.far;
      shadow.camera.updateProjectionMatrix();
      shadow.bias = SUN_SHADOW.bias;
      shadow.normalBias = SUN_SHADOW.normalBias;
      shadow.radius = SUN_SHADOW.radius;
      const initial = sunLightPosition({ x: 0, z: 0 }, getProps().direction, scratch.position);
      light.position.set(initial[0], initial[1], initial[2]);
      applyProps();
      state.scene.add(light);
      boundRef = getProps().lightRef;
      if (boundRef !== undefined) boundRef.current = light;
    },
    update() {
      applyProps();
    },
    frame(state: EngineFrameState) {
      if (light === null) return;
      const props = getProps();
      state.camera.getWorldDirection(scratch.forward);
      const focus = sunShadowFocus(state.camera.position, scratch.forward, scratch.focus);
      const [x, y, z] = sunLightPosition(focus, props.directionRef?.current ?? props.direction, scratch.position);
      light.position.set(x, y, z);
      light.target.position.set(focus.x, 0, focus.z);
      light.target.updateMatrixWorld();
    },
    dispose(state: EngineFrameState) {
      if (boundRef !== undefined) boundRef.current = null;
      boundRef = undefined;
      if (light !== null) {
        state.scene.remove(light);
        light = null;
      }
    },
  };
}

/**
 * Shadow-casting sun whose shadow box leads the camera each frame ({@link sunShadowFocus}), so
 * grounded shadows stay crisp and soft-edged under the player anywhere in a large world. Time-of-day
 * drivers aim it through `directionRef` and retint it through `lightRef`.
 * @internal
 */
export function SunLight(props: SunLightDrawProps) {
  const latest = useRef<SunLightDrawProps>(props);
  latest.current = props;
  return <EngineDrawMount create={() => sunLightDraw(() => latest.current)} deps={[]} />;
}

/**
 * The moon as a dim, shadowless key light opposite the sun, so a night scene keeps a lit and a
 * shaded side instead of collapsing into flat ambient. Same camera-following aim as the sun.
 * @internal
 */
export function MoonLight(props: Omit<SunLightDrawProps, "castShadow">) {
  const latest = useRef<SunLightDrawProps>({ ...props, castShadow: false });
  latest.current = { ...props, castShadow: false };
  return <EngineDrawMount create={() => sunLightDraw(() => latest.current)} deps={[]} />;
}

interface SkyDomeDisplay {
  top: THREE.Color;
  bottom: THREE.Color;
}

/**
 * Sets the zenith and horizon colors a sky dome should show on screen. The dome converts them each
 * frame through the renderer's tone mapping ({@link DisplayColorWriter}), so a picked swatch renders
 * as picked instead of greyed by the output curve.
 * @internal
 */
export function setSkyDomeColors(material: THREE.ShaderMaterial, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation): void {
  const display = material.userData as Partial<SkyDomeDisplay>;
  (display.top ??= new THREE.Color()).set(top);
  (display.bottom ??= new THREE.Color()).set(bottom);
}

/**
 * Scene fog whose color is a display color, converted through the renderer's tone mapping like the
 * dome's horizon so fogged ground meets the sky without a seam. Drivers retint it with
 * {@link setSkyFogColor}.
 * @internal
 */
export function SkyFog({ color, near, far, fogRef }: { color: string; near: number; far: number; fogRef?: RefObject<THREE.Fog | null> }) {
  const latest = useRef({ color, near, far, fogRef });
  latest.current = { color, near, far, fogRef };
  return <EngineDrawMount create={() => skyFogDraw(() => latest.current)} deps={[]} />;
}

/** Props for {@link skyFogDraw}: the fog's display color and range, plus the ref the old JSX exposed. */
export interface SkyFogDrawProps {
  color: string;
  near: number;
  far: number;
  fogRef?: RefObject<THREE.Fog | null> | undefined;
}

/**
 * Draw-side form of {@link SkyFog}: an owned `THREE.Fog` installed as the scene's fog, retinted per
 * frame through the display-color writer exactly like the JSX version. Restores the previous fog on
 * dispose.
 */
export function skyFogDraw(getProps: () => SkyFogDrawProps): EngineDraw {
  let fog: THREE.Fog | null = null;
  let scene: THREE.Scene | null = null;
  let previous: THREE.Scene["fog"] = null;
  let boundRef: RefObject<THREE.Fog | null> | undefined;
  const writer = new DisplayColorWriter();
  const applyProps = () => {
    if (fog === null) return;
    const props = getProps();
    fog.color.set(props.color);
    fog.near = props.near;
    fog.far = props.far;
    setSkyFogColor(fog, props.color);
  };
  return {
    mount(state: EngineFrameState) {
      scene = state.rootScene ?? state.scene;
      previous = scene.fog;
      fog = new THREE.Fog(0xffffff);
      applyProps();
      scene.fog = fog;
      boundRef = getProps().fogRef;
      if (boundRef !== undefined) boundRef.current = fog;
    },
    update() {
      applyProps();
    },
    frame(state: EngineFrameState) {
      const display = fog === null ? undefined : fogDisplayColors.get(fog);
      if (fog === null || display === undefined) return;
      writer.write(fog.color, display, state.gl);
    },
    dispose() {
      if (boundRef !== undefined) boundRef.current = null;
      boundRef = undefined;
      if (scene !== null && fog !== null) scene.fog = previous;
      scene = null;
      previous = null;
      fog = null;
    },
  };
}

/** Sets the display color a {@link SkyFog} converts each frame. @internal */
export function setSkyFogColor(fog: THREE.Fog, color: THREE.ColorRepresentation): void {
  const display = fogDisplayColors.get(fog);
  if (display === undefined) fogDisplayColors.set(fog, new THREE.Color(color));
  else display.set(color);
}

const fogDisplayColors = new WeakMap<THREE.Fog, THREE.Color>();

/**
 * The dome draws after the opaque scene (default order 0), so the buildings and terrain that cover
 * most of the screen have already written depth and the dome shades only the open sky; drawn first,
 * it shaded every pixel and the scene painted over most of them (0.12-0.18 ms of GPU a frame in
 * Harbor Heat and Fernwild, about 0.03 ms after). It writes no depth, so everything drawn later still
 * lands as before; overlays sit far above it (997-999). An opaque mesh that writes no depth and must
 * show over the sky needs an order above this one.
 * @internal
 */
export const SKY_RENDER_ORDER = 0.5;

/** Dome radius when the sky leaves it unset. */
const DEFAULT_SKY_RADIUS = 260;

/**
 * The dome's radius: the authored one, else the default pulled inside a short camera far plane, which
 * shapes the gradient the way an interior or close-camera game has always shown it.
 * @internal
 */
export function skyDomeRadius(authored: number | undefined, far: number | undefined): number {
  if (authored !== undefined) return authored;
  if (typeof far !== "number" || !Number.isFinite(far) || far <= 0) return DEFAULT_SKY_RADIUS;
  return Math.min(DEFAULT_SKY_RADIUS, far * 0.9);
}

function buildSkyDomeMaterial(p: SkyDomeProps): THREE.ShaderMaterial {
  const topColor = p.topColor ?? SKY_TOP;
  const horizonColor = p.horizonColor ?? SKY_HORIZON;
  const offset = p.offset ?? 24;
  const exponent = p.exponent ?? 0.65;
  const sunColor = p.sunColor ?? "#fff4d6";
  const sunDirection = p.sunDirection;
  const sunIntensity = p.sunIntensity ?? 1;
  const moonDirection = p.moonDirection;
  const moonColor = p.moonColor ?? MOON_COLOR;
  const moonIntensity = p.moonIntensity ?? 0;
  const starOpacity = p.starOpacity ?? 0;
  const hazeStrength = p.hazeStrength ?? 0.5;
  const sunGlowStrength = p.sunGlowStrength ?? 1;
  const cloudiness = p.cloudiness ?? 0.35;
  const dome = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(topColor) },
      bottomColor: { value: new THREE.Color(horizonColor) },
      offset: { value: offset },
      exponent: { value: exponent },
      uSunColor: { value: new THREE.Color(sunColor) },
      uSunDirection: { value: sunDirection === undefined ? new THREE.Vector3(0, 1, 0) : normalizeVec3(sunDirection) },
      uSunIntensity: { value: sunDirection === undefined ? 0 : sunIntensity },
      uMoonColor: { value: new THREE.Color(moonColor) },
      uMoonDirection: { value: moonDirection === undefined ? new THREE.Vector3(0, -1, 0) : normalizeVec3(moonDirection) },
      uMoonIntensity: { value: moonDirection === undefined ? 0 : moonIntensity },
      uStars: { value: starOpacity },
      uHazeStrength: { value: hazeStrength },
      uSunGlow: { value: sunGlowStrength },
      uCloudiness: { value: cloudiness },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // On the far plane: drawn after the opaque scene (SKY_RENDER_ORDER), the depth test then
        // shades only the pixels nothing covers, and no radius ever clips.
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDirection;
      uniform float uSunIntensity;
      uniform vec3 uMoonColor;
      uniform vec3 uMoonDirection;
      uniform float uMoonIntensity;
      uniform float uStars;
      uniform float uHazeStrength;
      uniform float uSunGlow;
      uniform float uCloudiness;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      float sHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float sNoise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x),
                   mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float sFbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a * sNoise(p); p *= 2.0; a *= 0.5; } return v; }
      float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float starField(vec3 dir){
        vec3 q = dir * 170.0;
        vec3 cell = floor(q);
        float seed = h3(cell);
        if (seed < 0.984) return 0.0;
        vec3 jitter = fract(vec3(seed * 137.0, seed * 311.0, seed * 531.0)) - 0.5;
        float d = length(fract(q) - 0.5 - jitter * 0.7);
        return smoothstep(0.18, 0.0, d) * smoothstep(0.984, 0.999, seed);
      }
      // Single-scattering terms the authored gradient lacks: a forward-scattering (Mie) aureole around
      // the sun, and a long path through the air when the sun is low that reddens the horizon on its side.
      vec3 skyScatter(vec3 vd, vec3 sunDir, float h) {
        float cosTheta = dot(vd, sunDir);
        float g = 0.76;
        float mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5) * 0.0045;
        float sunHeight = sunDir.y;
        float lowSun = (1.0 - smoothstep(0.04, 0.42, sunHeight)) * smoothstep(-0.16, 0.0, sunHeight);
        vec2 flatView = normalize(vd.xz + vec2(1e-5));
        vec2 flatSun = normalize(sunDir.xz + vec2(1e-5));
        float sunSide = pow(dot(flatView, flatSun) * 0.5 + 0.5, 2.0);
        float band = pow(1.0 - h, 4.0);
        return uSunColor * (mie * smoothstep(-0.1, 0.05, sunHeight) + band * sunSide * lowSun * 0.55);
      }
      void main() {
        vec3 dir = normalize(vWorldPosition + vec3(0.0, offset, 0.0));
        float h = max(dir.y, 0.0);
        vec3 col = mix(bottomColor, topColor, pow(h, exponent));
        col = mix(col, bottomColor * 1.12, pow(1.0 - h, 6.0) * uHazeStrength);
        vec3 vd = normalize(vWorldPosition);
        vec2 cuv = vd.xz / (max(vd.y, 0.06) + 0.15) * 1.2;
        float clouds = smoothstep(0.52, 0.82, sFbm(cuv));
        float band = smoothstep(0.08, 0.35, dir.y) * smoothstep(1.0, 0.35, dir.y);
        col = mix(col, mix(topColor, vec3(1.0), 0.6), clouds * band * uCloudiness);
        vec3 sunDir = normalize(uSunDirection);
        float sd = max(dot(vd, sunDir), 0.0);
        float glow = pow(sd, 8.0) * 0.35 + pow(sd, 128.0) * 2.6;
        col += uSunColor * glow * uSunIntensity * uSunGlow;
        col += skyScatter(vd, sunDir, h) * uSunIntensity * uSunGlow;
        if (uStars > 0.001) {
          float stars = starField(vd) * smoothstep(0.02, 0.22, vd.y) * smoothstep(0.35, 0.9, uStars);
          col += vec3(0.86, 0.9, 1.0) * stars * uStars * 1.6;
        }
        if (uMoonIntensity > 0.001) {
          float md = max(dot(vd, normalize(uMoonDirection)), 0.0);
          float disc = smoothstep(0.99955, 0.99985, md);
          float halo = pow(md, 512.0) * 0.5 + pow(md, 24.0) * 0.05;
          col += uMoonColor * (disc * 2.2 + halo) * uMoonIntensity;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  setSkyDomeColors(dome, topColor, horizonColor);
  return dome;
}

function skyDomeMaterialSignature(p: SkyDomeProps): string {
  return JSON.stringify([
    p.topColor ?? SKY_TOP, p.horizonColor ?? SKY_HORIZON, p.offset ?? 24, p.exponent ?? 0.65,
    p.sunColor ?? "#fff4d6", p.sunDirection ?? null, p.sunIntensity ?? 1,
    p.moonDirection ?? null, p.moonColor ?? MOON_COLOR, p.moonIntensity ?? 0,
    p.starOpacity ?? 0, p.hazeStrength ?? 0.5, p.sunGlowStrength ?? 1, p.cloudiness ?? 0.35,
  ]);
}

/**
 * Draw-side form of {@link SkyDome}: an owned shader-material sphere that follows the camera on x/z,
 * converts its zenith/horizon through the display-color writers each frame, and rebuilds its material
 * and geometry only when the resolved inputs change â€” the same memo boundaries the hooks had.
 */
export function skyDomeDraw(getProps: () => SkyDomeProps): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.SphereGeometry | null = null;
  let material: THREE.ShaderMaterial | null = null;
  let materialKey = "";
  let radius = -1;
  const writers = { top: new DisplayColorWriter(), bottom: new DisplayColorWriter() };
  const farOf = (state: EngineFrameState): number | undefined => (state.camera as THREE.PerspectiveCamera).far;
  const syncAssets = (state: EngineFrameState) => {
    const props = getProps();
    const nextRadius = skyDomeRadius(props.radius, farOf(state));
    const nextKey = skyDomeMaterialSignature(props);
    if (nextRadius !== radius) {
      const nextGeometry = new THREE.SphereGeometry(nextRadius, 32, 16);
      if (geometry !== null) geometry.dispose();
      geometry = nextGeometry;
      radius = nextRadius;
      if (mesh !== null) mesh.geometry = nextGeometry;
    }
    if (nextKey !== materialKey) {
      const next = buildSkyDomeMaterial(props);
      if (material !== null) material.dispose();
      material = next;
      materialKey = nextKey;
      if (mesh !== null) mesh.material = next;
    }
    const ref = props.materialRef;
    if (ref !== undefined) ref.current = material;
  };
  return {
    mount(state: EngineFrameState) {
      material = null;
      geometry = null;
      radius = -1;
      materialKey = "";
      mesh = new THREE.Mesh();
      mesh.renderOrder = SKY_RENDER_ORDER;
      mesh.frustumCulled = false;
      syncAssets(state);
      state.scene.add(mesh);
    },
    update(state: EngineFrameState) {
      syncAssets(state);
    },
    frame(state: EngineFrameState) {
      if (material === null) return;
      const display = material.userData as SkyDomeDisplay;
      writers.top.write(material.uniforms["topColor"]!.value as THREE.Color, display.top, state.gl);
      writers.bottom.write(material.uniforms["bottomColor"]!.value as THREE.Color, display.bottom, state.gl);
      if (mesh === null) return;
      mesh.position.x = state.camera.position.x;
      mesh.position.z = state.camera.position.z;
    },
    dispose(state: EngineFrameState) {
      const ref = getProps().materialRef;
      if (ref !== undefined) ref.current = null;
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh = null;
      }
      geometry?.dispose();
      geometry = null;
      material?.dispose();
      material = null;
      materialKey = "";
      radius = -1;
    },
  };
}

/**
 * @internal
 */
export function SkyDome(props: SkyDomeProps = {}) {
  const latest = useRef<SkyDomeProps>(props);
  latest.current = props;
  return <EngineDrawMount create={() => skyDomeDraw(() => latest.current)} deps={[]} />;
}

/** Points the dome's sun glow at `position` and keeps the disc lit; called per frame by the time-of-day drivers. */
function aimSkySun(material: THREE.ShaderMaterial, position: readonly [number, number, number]): void {
  (material.uniforms["uSunDirection"]!.value as THREE.Vector3).set(position[0], position[1], position[2]).normalize();
}

/** Props for {@link Sky}: the sky descriptor, the clock that runs it, who owns the lights, and biome bands. */
export interface SkyProps {
  sky: SkyEnvironmentDescriptor;
  /**
   * The world's `SimClock` (or a stub exposing `calendar().dayFraction`). With `sky.timeOfDay` it
   * drives the sun, moon, dome and fog through the day; absent, the sky holds its preset's look.
   */
  clock?: { calendar(): { dayFraction: number } };
  /**
   * Mount the sky's own hemisphere fill, sun and moon. Default true. `false` keeps only dome and
   * fog, for a game that authors `PlayableGame.lighting`.
   */
  lights?: boolean;
  /**
   * Authored lights to drive through the day: each frame the sky writes the sun/ambient factors
   * and sun tint the configured lights read (the authored values are the noon keyframe) and mounts
   * the moon. Use with `lights={false}` under a time-of-day sky.
   */
  modulation?: DaylightModulation;
  /** Terrain `biomeBands`; any band carrying `fog`/`sky` cross-fades fog, dome and light per camera z. */
  bands?: readonly BiomeBand[];
  /** Fog range authored on the game's `backdrop.fog`, used when the sky descriptor sets none. */
  fogRange?: { near?: number; far?: number };
  /**
   * The world's weather (`ctx.environment`): wherever the camera is, its cloud cover (an overcast
   * profile, or falling rain or snow) greys the dome and fog, dims the sun and thickens the clouds.
   * Omit for a sky that ignores the weather.
   */
  weather?: { sample(x: number, z: number): { precipitation: number; cloudCover?: number } };
}

/** Fog range: the sky's own fields win, then the authored backdrop, then the caller's default. */
function skyFogRange(sky: SkyEnvironmentDescriptor, fogRange: SkyProps["fogRange"], fallback: { near: number; far: number }) {
  return { near: sky.fog?.near ?? fogRange?.near ?? fallback.near, far: sky.fog?.far ?? fogRange?.far ?? fallback.far };
}

/** Dome-shape overrides (radius, haze, sun-glow) carried by the sky descriptor, spread onto `SkyDome`; unset fields keep the dome defaults. */
function skyDomeShape(
  sky: SkyEnvironmentDescriptor,
): Pick<SkyDomeProps, "radius" | "hazeStrength" | "sunGlowStrength" | "exponent" | "cloudiness"> {
  return {
    ...(sky.radius === undefined ? {} : { radius: sky.radius }),
    ...(sky.hazeStrength === undefined ? {} : { hazeStrength: sky.hazeStrength }),
    ...(sky.sunGlowStrength === undefined ? {} : { sunGlowStrength: sky.sunGlowStrength }),
    ...(sky.gradientExponent === undefined ? {} : { exponent: sky.gradientExponent }),
    ...(sky.cloudiness === undefined ? {} : { cloudiness: sky.cloudiness }),
  };
}

const NO_BANDS: readonly BiomeBand[] = [];

interface SkyLightWriters {
  zenith: DisplayColorWriter;
  horizon: DisplayColorWriter;
  display: THREE.Color;
}

/** Fill the published {@link SkyLight} from this frame's daylight, as the dome and the lights show it. */
function writeSkyLight(
  light: SkyLight,
  writers: SkyLightWriters,
  gl: THREE.WebGLRenderer,
  state: Pick<DaylightState, "sunPosition" | "sunColor" | "moonPosition" | "moonColor" | "moonIntensity">,
  sky: { zenithColor: string; horizonColor: string; sunIntensity: number; ambientIntensity: number },
  cover: number,
  noon: { sun: number; ambient: number },
): void {
  light.sunDirection.set(state.sunPosition[0], state.sunPosition[1], state.sunPosition[2]).normalize();
  light.sun.set(state.sunColor).multiplyScalar(light.sunDirection.y > -0.02 ? sky.sunIntensity : 0);
  light.moonDirection.set(state.moonPosition[0], state.moonPosition[1], state.moonPosition[2]).normalize();
  light.moon.set(state.moonColor).multiplyScalar(state.moonIntensity);
  light.ambient.set(HEMI_SKY).multiplyScalar(sky.ambientIntensity);
  writers.zenith.write(light.zenith, writers.display.set(sky.zenithColor), gl);
  writers.horizon.write(light.horizon, writers.display.set(sky.horizonColor), gl);
  light.cloudCover = cover;
  const sunShare = light.sunDirection.y > -0.02 && noon.sun > 0 ? sky.sunIntensity / noon.sun : 0;
  const ambientShare = noon.ambient > 0 ? sky.ambientIntensity / noon.ambient : 0;
  light.daylight = Math.min(1, Math.max(0, sunShare, ambientShare));
}

/** Everything the sky's children and frame read, resolved once per prop-identity sync. */
interface SkyDerived {
  timeOfDay: boolean;
  banded: boolean;
  lights: boolean;
  mountMoon: boolean;
  initial: DaylightState;
  noon: { sun: number; ambient: number };
  fogFallback: { color: string; near: number; far: number; density: number };
  fogSampler: ReturnType<typeof createBiomeFogSampler>;
  skySampler: ReturnType<typeof createBiomeSkySampler>;
  domeProps: SkyDomeProps;
  fogProps: SkyFogDrawProps;
  sunProps: SunLightDrawProps;
  moonProps: SunLightDrawProps;
  rules: ReturnType<typeof resolveVolumetricClouds> | null;
  hemiArgs: { sky: string; ground: string; intensity: number };
}

function deriveSky(props: SkyProps, refs: {
  skyMaterialRef: RefObject<THREE.ShaderMaterial | null>;
  fogRef: RefObject<THREE.Fog | null>;
  sunRef: RefObject<THREE.DirectionalLight | null>;
  moonRef: RefObject<THREE.DirectionalLight | null>;
  sunDirectionRef: { current: readonly [number, number, number] };
  moonDirectionRef: { current: readonly [number, number, number] };
}): SkyDerived {
  const sky = props.sky;
  const clock = props.clock;
  const timeOfDay = sky.timeOfDay === true && clock !== undefined;
  const baseFraction = sky.timeOfDay === true && clock !== undefined ? clock.calendar().dayFraction : SKY_PRESET_DAY_FRACTION[sky.preset];
  const initial = daylightStateAt(baseFraction, sky);
  const range = skyFogRange(sky, props.fogRange, { near: 70, far: 260 });
  const noonSun = sky.sunIntensity ?? DEFAULT_DAY_SUN_INTENSITY;
  const noonAmbient = sky.ambientIntensity ?? DEFAULT_DAY_AMBIENT_INTENSITY;
  const noon = { sun: noonSun, ambient: noonAmbient };
  const fogFallback = { color: sky.fog?.color ?? initial.fogColor, near: range.near, far: range.far, density: 0 };
  const skyFallback = {
    horizonColor: initial.skyBottom,
    zenithColor: initial.skyTop,
    sunIntensity: initial.sunIntensity,
    ambientIntensity: initial.ambientIntensity,
  };
  const bands = props.bands ?? NO_BANDS;
  const banded = bands.some((band) => band.fog !== undefined || band.sky !== undefined);
  const lights = props.lights !== false;
  // The moon's light is part of every lit program, so mounting it as it crosses the horizon would
  // relink the whole scene: a cycling sky keeps it mounted, dark by day. A fixed day sky, whose moon
  // never rises, does not carry it; a zero-intensity light still costs every lit fragment a loop.
  const mountMoon = (lights || props.modulation !== undefined) && (timeOfDay || initial.moonIntensity > 0);
  // Seed the live aim refs with this sync's directions, like the old ref initializers did, so the
  // first child frame already aims correctly.
  refs.sunDirectionRef.current = initial.sunPosition;
  refs.moonDirectionRef.current = initial.moonPosition;
  const domeProps: SkyDomeProps = {
    topColor: initial.skyTop,
    horizonColor: initial.skyBottom,
    sunDirection: initial.sunPosition,
    sunColor: initial.sunColor,
    materialRef: refs.skyMaterialRef,
    moonDirection: initial.moonPosition,
    moonColor: initial.moonColor,
    moonIntensity: initial.moonIntensity,
    starOpacity: initial.starOpacity,
    ...skyDomeShape(sky),
  };
  return {
    timeOfDay,
    banded,
    lights,
    mountMoon,
    initial,
    noon,
    fogFallback,
    fogSampler: createBiomeFogSampler(bands, fogFallback),
    skySampler: createBiomeSkySampler(bands, skyFallback),
    domeProps,
    fogProps: { color: fogFallback.color, near: fogFallback.near, far: fogFallback.far, fogRef: refs.fogRef },
    sunProps: {
      direction: initial.sunPosition,
      directionRef: refs.sunDirectionRef as MutableRefObject<readonly [number, number, number]>,
      lightRef: refs.sunRef,
      intensity: initial.sunIntensity,
      color: initial.sunColor,
      castShadow: true,
    },
    moonProps: {
      direction: initial.moonPosition,
      directionRef: refs.moonDirectionRef as MutableRefObject<readonly [number, number, number]>,
      lightRef: refs.moonRef,
      intensity: initial.moonIntensity,
      color: initial.moonColor,
      castShadow: false,
    },
    rules: sky.volumetricClouds === undefined ? null : resolveVolumetricClouds(sky.volumetricClouds),
    hemiArgs: { sky: HEMI_SKY, ground: HEMI_GROUND, intensity: initial.ambientIntensity },
  };
}

/**
 * The engine's one sky, as a draw: a dome with sun, moon and stars, volumetric clouds when the
 * descriptor asks, the scene fog, and (unless `lights={false}`) the sun, moon and hemisphere fill.
 * It holds the preset's look, follows the world clock under `sky.timeOfDay`, cross-fades through
 * terrain `biomeBands` by camera z, and can drive a game's authored lights through the day via
 * `modulation`. Every frame it rewrites uniforms and light values in place, never remounting.
 * @capability day-night-sky one sky for a fixed look, a day-night cycle, biome bands and authored lights
 */
export function skyDraw(getProps: () => SkyProps): EngineDraw {
  const host = new THREE.Group();
  const children: { draw: EngineDraw; state: EngineFrameState }[] = [];
  const skyLight = createSkyLight();
  const lightWriters: SkyLightWriters = { zenith: new DisplayColorWriter(), horizon: new DisplayColorWriter(), display: new THREE.Color() };
  const sunRef = { current: null as THREE.DirectionalLight | null };
  const moonRef = { current: null as THREE.DirectionalLight | null };
  const sunDirectionRef = { current: [0, 1, 0] as readonly [number, number, number] };
  const moonDirectionRef = { current: [0, -1, 0] as readonly [number, number, number] };
  const skyMaterialRef = { current: null as THREE.ShaderMaterial | null };
  const fogRef = { current: null as THREE.Fog | null };
  const refs = { skyMaterialRef, fogRef, sunRef, moonRef, sunDirectionRef, moonDirectionRef };
  let hemi: THREE.HemisphereLight | null = null;
  let derived: SkyDerived | null = null;
  let built: SkyProps | null = null;

  const clearChildren = () => {
    for (const child of children.splice(0)) child.draw.dispose?.(child.state);
    if (hemi !== null) {
      host.remove(hemi);
      hemi = null;
    }
  };

  const buildChildren = (mountState: EngineFrameState) => {
    clearChildren();
    const props = getProps();
    derived = deriveSky(props, refs);
    const d = derived;
    const childState = childFrameState(mountState, host);
    const add = (draw: EngineDraw) => {
      children.push({ draw, state: childState });
      draw.mount?.(childState);
    };
    add(skyDomeDraw(() => d.domeProps));
    const rules = d.rules;
    if (rules !== null) add(volumetricCloudsDraw(() => ({ rules })));
    add(skyFogDraw(() => d.fogProps));
    if (d.lights) {
      hemi = new THREE.HemisphereLight(d.hemiArgs.sky, d.hemiArgs.ground, d.hemiArgs.intensity);
      childState.scene.add(hemi);
      add(sunLightDraw(() => d.sunProps));
    }
    if (d.mountMoon) add(sunLightDraw(() => d.moonProps));
    built = props;
  };

  const sameSkyInputs = (a: SkyProps, b: SkyProps): boolean =>
    a.sky === b.sky && a.clock === b.clock && a.lights === b.lights &&
    a.bands === b.bands && a.fogRange === b.fogRange;

  return {
    mount(mountState: EngineFrameState) {
      mountState.scene.add(host);
      buildChildren(mountState);
    },
    update(mountState: EngineFrameState) {
      const props = getProps();
      if (built === null || !sameSkyInputs(props, built)) {
        buildChildren(mountState);
        return;
      }
      for (const child of children) child.draw.update?.(child.state);
    },
    frame(state: EngineFrameState) {
      for (const child of children) child.draw.frame?.(child.state, child.state.delta);
      const d = derived;
      if (d === null) return;
      const props = getProps();
      publishSkyLight(state.rootScene ?? state.scene, skyLight);
      if (!d.timeOfDay && !d.banded && props.weather === undefined) {
        writeSkyLight(skyLight, lightWriters, state.gl, d.initial, { zenithColor: d.initial.skyTop, horizonColor: d.initial.skyBottom, sunIntensity: d.initial.sunIntensity, ambientIntensity: d.initial.ambientIntensity }, 0, d.noon);
        return;
      }
      const frameClock = props.clock;
      const cycle = d.timeOfDay && frameClock !== undefined ? daylightStateAt(frameClock.calendar().dayFraction, props.sky) : d.initial;
      const here = props.weather?.sample(state.camera.position.x, state.camera.position.z);
      const cover = here === undefined ? 0 : (here.cloudCover ?? here.precipitation);
      const base = cover > 0 ? overcastDaylight(cycle, cover) : cycle;
      const z = state.camera.position.z;
      const fog = d.banded ? d.fogSampler(z) : null;
      const skyValue = d.banded
        ? d.skySampler(z)
        : { zenithColor: base.skyTop, horizonColor: base.skyBottom, sunIntensity: base.sunIntensity, ambientIntensity: base.ambientIntensity };
      const fogNode = fogRef.current;
      if (fogNode !== null) {
        // Under a day cycle the sky owns the fog color (bands still own its range): a fixed noon
        // tint would leave bright haze hanging in a black night sky.
        setSkyFogColor(fogNode, bandFogColor({ timeOfDay: d.timeOfDay, cycle: base.fogColor, band: fog?.color ?? d.fogFallback.color }));
        if (fog !== null) {
          fogNode.near = fog.near;
          fogNode.far = fog.far;
        }
      }
      const skyMaterial = skyMaterialRef.current;
      if (skyMaterial !== null) {
        setSkyDomeColors(skyMaterial, skyValue.zenithColor, skyValue.horizonColor);
        aimSkySun(skyMaterial, base.sunPosition);
        setSkyMoon(skyMaterial, base.moonPosition, base.moonColor, base.moonIntensity, base.starOpacity);
      }
      sunDirectionRef.current = base.sunPosition;
      moonDirectionRef.current = base.moonPosition;
      const moon = moonRef.current;
      if (moon !== null) {
        moon.intensity = base.moonIntensity;
        moon.color.set(base.moonColor);
      }
      const sun = sunRef.current;
      if (sun !== null) {
        sun.intensity = skyValue.sunIntensity;
        sun.color.set(base.sunColor);
      }
      if (hemi !== null) hemi.intensity = skyValue.ambientIntensity;
      writeSkyLight(skyLight, lightWriters, state.gl, base, skyValue, cover, d.noon);
      if (props.modulation !== undefined) {
        props.modulation.sunFactor = skyValue.sunIntensity / d.noon.sun;
        props.modulation.sunColor = base.sunColor;
        props.modulation.ambientFactor = skyValue.ambientIntensity / d.noon.ambient;
      }
    },
    dispose(disposeState: EngineFrameState) {
      clearChildren();
      disposeState.scene.remove(host);
      host.clear();
      derived = null;
      built = null;
    },
  };
}

/**
 * The engine's one sky: a dome with sun, moon and stars, volumetric clouds when the descriptor asks,
 * the scene fog, and (unless `lights={false}`) the sun, moon and hemisphere fill. It holds the
 * preset's look, follows the world clock under `sky.timeOfDay`, cross-fades through terrain
 * `biomeBands` by camera z, and can drive a game's authored lights through the day via
 * `modulation`. Every frame it rewrites uniforms and light values in place, never remounting.
 * @capability day-night-sky one sky for a fixed look, a day-night cycle, biome bands and authored lights
 */
export function Sky(props: SkyProps) {
  const latest = useRef<SkyProps>(props);
  latest.current = props;
  return <EngineDrawMount create={() => skyDraw(() => latest.current)} deps={[]} />;
}
