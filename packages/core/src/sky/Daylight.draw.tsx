import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";

import type { BiomeBand, SkyEnvironmentDescriptor } from "@jgengine/core/world/features";
import { createBiomeFogSampler, createBiomeSkySampler } from "@jgengine/core/terrain/terrain";
import { resolveVolumetricClouds } from "@jgengine/core/sky/volumetricClouds";

import { warnOnce } from "@jgengine/core/devtools/warnOnce";

import { DisplayColorWriter } from "@jgengine/shell/render/displayColor";
import type { DaylightModulation } from "@jgengine/shell/render/SceneLighting";
import {
  bandFogColor,
  daylightStateAt,
  DEFAULT_DAY_AMBIENT_INTENSITY,
  DEFAULT_DAY_SUN_INTENSITY,
  SKY_PRESET_DAY_FRACTION,
} from "@jgengine/core/sky/daylightCycle";
import { publishSkySun } from "./skySun.draw";
import { SUN_SHADOW, sunLightPosition, sunShadowFocus } from "./sunShadowMath";
import { VolumetricClouds } from "./VolumetricClouds.draw";

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
  (material.uniforms.uMoonDirection!.value as THREE.Vector3).set(direction[0], direction[1], direction[2]).normalize();
  (material.uniforms.uMoonColor!.value as THREE.Color).set(color);
  material.uniforms.uMoonIntensity!.value = intensity;
  material.uniforms.uStars!.value = starOpacity;
}

/**
 * Shadow-casting sun whose shadow box leads the camera each frame ({@link sunShadowFocus}), so
 * grounded shadows stay crisp and soft-edged under the player anywhere in a large world. Time-of-day
 * drivers aim it through `directionRef` and retint it through `lightRef`.
 * @internal
 */
export function SunLight({
  direction,
  directionRef,
  lightRef,
  intensity,
  color,
  castShadow = true,
}: {
  direction: readonly [number, number, number];
  directionRef?: MutableRefObject<readonly [number, number, number]>;
  lightRef?: RefObject<THREE.DirectionalLight | null>;
  intensity: number;
  color: string;
  /** Shadow-casting key light. Off for the moon: its light is too weak to read a shadow and a second shadow pass is not free. */
  castShadow?: boolean;
}) {
  const ownRef = useRef<THREE.DirectionalLight>(null);
  const ref = lightRef ?? ownRef;
  const scratch = useMemo(() => ({ forward: new THREE.Vector3(), focus: { x: 0, z: 0 }, position: [0, 0, 0] as [number, number, number] }), []);
  useFrame((state) => {
    const light = ref.current;
    if (light === null) return;
    state.camera.getWorldDirection(scratch.forward);
    const focus = sunShadowFocus(state.camera.position, scratch.forward, scratch.focus);
    const [x, y, z] = sunLightPosition(focus, directionRef?.current ?? direction, scratch.position);
    light.position.set(x, y, z);
    light.target.position.set(focus.x, 0, focus.z);
    light.target.updateMatrixWorld();
  });
  const initial = sunLightPosition({ x: 0, z: 0 }, direction);
  return (
    <directionalLight
      ref={ref}
      position={initial}
      intensity={intensity}
      color={color}
      castShadow={castShadow}
      shadow-mapSize-width={SUN_SHADOW.mapSize}
      shadow-mapSize-height={SUN_SHADOW.mapSize}
      shadow-camera-left={-SUN_SHADOW.halfExtent}
      shadow-camera-right={SUN_SHADOW.halfExtent}
      shadow-camera-top={SUN_SHADOW.halfExtent}
      shadow-camera-bottom={-SUN_SHADOW.halfExtent}
      shadow-camera-near={SUN_SHADOW.near}
      shadow-camera-far={SUN_SHADOW.far}
      shadow-bias={SUN_SHADOW.bias}
      shadow-normalBias={SUN_SHADOW.normalBias}
      shadow-radius={SUN_SHADOW.radius}
    />
  );
}

/**
 * The moon as a dim, shadowless key light opposite the sun, so a night scene keeps a lit and a
 * shaded side instead of collapsing into flat ambient. Same camera-following aim as the sun.
 * @internal
 */
export function MoonLight({ direction, directionRef, lightRef, intensity, color }: {
  direction: readonly [number, number, number];
  directionRef?: MutableRefObject<readonly [number, number, number]>;
  lightRef?: RefObject<THREE.DirectionalLight | null>;
  intensity: number;
  color: string;
}) {
  return <SunLight direction={direction} directionRef={directionRef} lightRef={lightRef} intensity={intensity} color={color} castShadow={false} />;
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
  const ownRef = useRef<THREE.Fog>(null);
  const ref = fogRef ?? ownRef;
  const writer = useMemo(() => new DisplayColorWriter(), []);
  useLayoutEffect(() => {
    if (ref.current !== null) setSkyFogColor(ref.current, color);
  }, [ref, color]);
  useFrame((state) => {
    const fog = ref.current;
    const display = fog === null ? undefined : fogDisplayColors.get(fog);
    if (fog === null || display === undefined) return;
    writer.write(fog.color, display, state.gl);
  });
  return <fog attach="fog" ref={ref} args={[color, near, far]} />;
}

/** Sets the display color a {@link SkyFog} converts each frame. @internal */
export function setSkyFogColor(fog: THREE.Fog, color: THREE.ColorRepresentation): void {
  const display = fogDisplayColors.get(fog);
  if (display === undefined) fogDisplayColors.set(fog, new THREE.Color(color));
  else display.set(color);
}

const fogDisplayColors = new WeakMap<THREE.Fog, THREE.Color>();

/** Dome radius when the sky leaves it unset. */
const DEFAULT_SKY_RADIUS = 260;

/**
 * The dome's radius: the authored one, else the default pulled inside a short camera far plane so an
 * interior or close-camera game that never asked for a sky still gets one instead of a black clip.
 * @internal
 */
export function skyDomeRadius(authored: number | undefined, far: number | undefined): number {
  if (authored !== undefined) return authored;
  if (typeof far !== "number" || !Number.isFinite(far) || far <= 0) return DEFAULT_SKY_RADIUS;
  return Math.min(DEFAULT_SKY_RADIUS, far * 0.9);
}

/** @internal */
export function SkyDome({
  topColor = SKY_TOP,
  horizonColor = SKY_HORIZON,
  radius: authoredRadius,
  offset = 24,
  exponent = 0.65,
  sunDirection,
  sunColor = "#fff4d6",
  sunIntensity = 1,
  moonDirection,
  moonColor = MOON_COLOR,
  moonIntensity = 0,
  starOpacity = 0,
  hazeStrength = 0.5,
  sunGlowStrength = 1,
  cloudiness = 0.35,
  materialRef,
}: SkyDomeProps = {}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const far = useThree((state) => (state.camera as THREE.PerspectiveCamera).far);
  const radius = skyDomeRadius(authoredRadius, far);
  const material = useMemo(() => {
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
  }, [topColor, horizonColor, offset, exponent, sunColor, sunDirection, sunIntensity, moonDirection, moonColor, moonIntensity, starOpacity, hazeStrength, sunGlowStrength, cloudiness]);
  useEffect(() => {
    if (materialRef !== undefined) materialRef.current = material;
    return () => {
      material.dispose();
      if (materialRef !== undefined) materialRef.current = null;
    };
  }, [material, materialRef]);
  const writers = useMemo(() => ({ top: new DisplayColorWriter(), bottom: new DisplayColorWriter() }), []);
  useEffect(() => {
    if (authoredRadius === undefined || typeof far !== "number" || radius < far) return;
    warnOnce(
      "sky-dome-radius",
      `[jgengine] sky radius ${radius} is at or beyond the camera far plane ${far}; the dome depth-clips to black. Lower sky.radius or raise camera.frustum.far.`,
    );
  }, [authoredRadius, far, radius]);
  useFrame((state) => {
    const display = material.userData as SkyDomeDisplay;
    writers.top.write(material.uniforms.topColor!.value as THREE.Color, display.top, state.gl);
    writers.bottom.write(material.uniforms.bottomColor!.value as THREE.Color, display.bottom, state.gl);
    const mesh = meshRef.current;
    if (mesh === null) return;
    mesh.position.x = state.camera.position.x;
    mesh.position.z = state.camera.position.z;
  });
  return (
    <mesh ref={meshRef} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}

/** Points the dome's sun glow at `position` and keeps the disc lit; called per frame by the time-of-day drivers. */
function aimSkySun(material: THREE.ShaderMaterial, position: readonly [number, number, number]): void {
  (material.uniforms.uSunDirection!.value as THREE.Vector3).set(position[0], position[1], position[2]).normalize();
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

/**
 * The engine's one sky: a dome with sun, moon and stars, volumetric clouds when the descriptor asks,
 * the scene fog, and (unless `lights={false}`) the sun, moon and hemisphere fill. It holds the
 * preset's look, follows the world clock under `sky.timeOfDay`, cross-fades through terrain
 * `biomeBands` by camera z, and can drive a game's authored lights through the day via
 * `modulation`. Every frame it rewrites uniforms and light values in place, never remounting.
 * @capability day-night-sky one sky for a fixed look, a day-night cycle, biome bands and authored lights
 */
export function Sky({ sky, clock, lights = true, modulation, bands = NO_BANDS, fogRange }: SkyProps) {
  const timeOfDay = sky.timeOfDay === true && clock !== undefined;
  const baseFraction = timeOfDay ? clock!.calendar().dayFraction : SKY_PRESET_DAY_FRACTION[sky.preset];
  const initial = useMemo(() => daylightStateAt(baseFraction, sky), [sky, baseFraction]);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const sunDirectionRef = useRef<readonly [number, number, number]>(initial.sunPosition);
  const moonRef = useRef<THREE.DirectionalLight>(null);
  const moonDirectionRef = useRef<readonly [number, number, number]>(initial.moonPosition);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const skyMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const range = skyFogRange(sky, fogRange, { near: 70, far: 260 });
  const noonSun = sky.sunIntensity ?? DEFAULT_DAY_SUN_INTENSITY;
  const noonAmbient = sky.ambientIntensity ?? DEFAULT_DAY_AMBIENT_INTENSITY;

  const fogFallback = useMemo(
    () => ({ color: sky.fog?.color ?? initial.fogColor, near: range.near, far: range.far, density: 0 }),
    [sky.fog?.color, range.near, range.far, initial.fogColor],
  );
  const skyFallback = useMemo(
    () => ({
      horizonColor: initial.skyBottom,
      zenithColor: initial.skyTop,
      sunIntensity: initial.sunIntensity,
      ambientIntensity: initial.ambientIntensity,
    }),
    [initial.skyBottom, initial.skyTop, initial.sunIntensity, initial.ambientIntensity],
  );
  const fogSampler = useMemo(() => createBiomeFogSampler(bands, fogFallback), [bands, fogFallback]);
  const skySampler = useMemo(() => createBiomeSkySampler(bands, skyFallback), [bands, skyFallback]);
  const banded = bands.some((band) => band.fog !== undefined || band.sky !== undefined);
  // The moon's light is part of every lit program, so mounting it as it crosses the horizon would
  // relink the whole scene: a cycling sky keeps it mounted, dark by day. A fixed day sky, whose moon
  // never rises, does not carry it; a zero-intensity light still costs every lit fragment a loop.
  const mountMoon = (lights || modulation !== undefined) && (timeOfDay || initial.moonIntensity > 0);

  useFrame((state) => {
    if (!timeOfDay && !banded) {
      publishSkySun(state.scene, initial.sunPosition);
      return;
    }
    const base = timeOfDay ? daylightStateAt(clock!.calendar().dayFraction, sky) : initial;
    publishSkySun(state.scene, base.sunPosition);
    const z = state.camera.position.z;
    const fog = banded ? fogSampler(z) : null;
    const skyValue = banded
      ? skySampler(z)
      : { zenithColor: base.skyTop, horizonColor: base.skyBottom, sunIntensity: base.sunIntensity, ambientIntensity: base.ambientIntensity };
    const fogNode = fogRef.current;
    if (fogNode !== null) {
      // Under a day cycle the sky owns the fog color (bands still own its range): a fixed noon
      // tint would leave bright haze hanging in a black night sky.
      setSkyFogColor(fogNode, bandFogColor({ authored: sky.fog?.color, timeOfDay, cycle: base.fogColor, band: fog?.color ?? fogFallback.color }));
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
    const hemi = hemiRef.current;
    if (hemi !== null) hemi.intensity = skyValue.ambientIntensity;
    if (modulation !== undefined) {
      modulation.sunFactor = skyValue.sunIntensity / noonSun;
      modulation.sunColor = base.sunColor;
      modulation.ambientFactor = skyValue.ambientIntensity / noonAmbient;
    }
  });

  return (
    <>
      <SkyDome
        topColor={initial.skyTop}
        horizonColor={initial.skyBottom}
        sunDirection={initial.sunPosition}
        sunColor={initial.sunColor}
        materialRef={skyMaterialRef}
        moonDirection={initial.moonPosition}
        moonColor={initial.moonColor}
        moonIntensity={initial.moonIntensity}
        starOpacity={initial.starOpacity}
        {...skyDomeShape(sky)}
      />
      {sky.volumetricClouds === undefined ? null : (
        <VolumetricClouds rules={resolveVolumetricClouds(sky.volumetricClouds)} sunDirection={initial.sunPosition} />
      )}
      <SkyFog fogRef={fogRef} color={fogFallback.color} near={fogFallback.near} far={fogFallback.far} />
      {lights ? (
        <>
          <hemisphereLight ref={hemiRef} args={[HEMI_SKY, HEMI_GROUND, initial.ambientIntensity]} />
          <SunLight
            direction={initial.sunPosition}
            directionRef={sunDirectionRef}
            lightRef={sunRef}
            intensity={initial.sunIntensity}
            color={initial.sunColor}
          />
        </>
      ) : null}
      {mountMoon ? (
        <MoonLight
          direction={initial.moonPosition}
          directionRef={moonDirectionRef}
          lightRef={moonRef}
          intensity={initial.moonIntensity}
          color={initial.moonColor}
        />
      ) : null}
    </>
  );
}
