import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";

import type { BiomeBand, SkyEnvironmentDescriptor } from "@jgengine/core/world/features";
import { createBiomeFogSampler, createBiomeSkySampler } from "@jgengine/core/world/terrain";
import { resolveVolumetricClouds, type VolumetricCloudsConfig } from "@jgengine/core/world/volumetricClouds";

import { warnOnce } from "@jgengine/core/devtools/warnOnce";

import { DisplayColorWriter } from "../render/displayColor";
import { daylightStateAt, SKY_PRESET_DAY_FRACTION } from "./daylightCycle";
import { SUN_SHADOW, sunLightPosition, sunShadowFocus } from "./sunShadowMath";
import { VolumetricClouds } from "./VolumetricClouds";

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
const FOG_COLOR = "#e9f6ff";
const SUN_COLOR = "#fff1c9";
const HEMI_SKY = "#bfe3ff";
const HEMI_GROUND = "#4c6b34";

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
}: {
  direction: readonly [number, number, number];
  directionRef?: MutableRefObject<readonly [number, number, number]>;
  lightRef?: RefObject<THREE.DirectionalLight | null>;
  intensity: number;
  color: string;
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
      castShadow
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

/** @internal */
export function SkyDome({
  topColor = SKY_TOP,
  horizonColor = SKY_HORIZON,
  radius = 260,
  offset = 24,
  exponent = 0.65,
  sunDirection,
  sunColor = "#fff4d6",
  sunIntensity = 1,
  hazeStrength = 0.5,
  sunGlowStrength = 1,
  cloudiness = 0.35,
  materialRef,
}: SkyDomeProps = {}) {
  const meshRef = useRef<THREE.Mesh>(null);
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
          float sd = max(dot(vd, normalize(uSunDirection)), 0.0);
          float glow = pow(sd, 8.0) * 0.35 + pow(sd, 128.0) * 2.6;
          col += uSunColor * glow * uSunIntensity * uSunGlow;
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
  }, [topColor, horizonColor, offset, exponent, sunColor, sunDirection, sunIntensity, hazeStrength, sunGlowStrength, cloudiness]);
  useEffect(() => {
    if (materialRef !== undefined) materialRef.current = material;
    return () => {
      material.dispose();
      if (materialRef !== undefined) materialRef.current = null;
    };
  }, [material, materialRef]);
  const camera = useThree((state) => state.camera);
  const writers = useMemo(() => ({ top: new DisplayColorWriter(), bottom: new DisplayColorWriter() }), []);
  useEffect(() => {
    const far = (camera as THREE.PerspectiveCamera).far;
    if (typeof far !== "number" || radius < far) return;
    warnOnce(
      "sky-dome-radius",
      `[jgengine] sky radius ${radius} is at or beyond the camera far plane ${far}; the dome depth-clips to black. Lower sky.radius or raise camera.frustum.far.`,
    );
  }, [camera, radius]);
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

export interface DaylightProps {
  sky?: SkyDomeProps | false;
  fog?: { color?: string; near?: number; far?: number } | false;
  sun?: { position?: readonly [number, number, number]; intensity?: number; color?: string };
  ambient?: { skyColor?: string; groundColor?: string; intensity?: number };
  /** When false, only the sky dome and fog mount — use with authored `PlayableGame.lighting`. Default true. */
  lights?: boolean;
  /** Raymarched volumetric cloud layer over the sky dome. Omit for no clouds — off by default. */
  clouds?: VolumetricCloudsConfig;
}

/** @internal */
export function Daylight({ sky, fog, sun, ambient, lights = true, clouds }: DaylightProps = {}) {
  const sunPosition = sun?.position ?? [120, 160, 70];
  return (
    <>
      {sky === false ? null : (
        <SkyDome
          {...(sky ?? {})}
          sunDirection={sunPosition}
          sunColor={sun?.color ?? SUN_COLOR}
          sunIntensity={sun?.intensity ?? 1}
        />
      )}
      {clouds === undefined ? null : (
        <VolumetricClouds rules={resolveVolumetricClouds(clouds)} sunDirection={sunPosition} />
      )}
      {fog === false ? null : (
        <SkyFog color={fog?.color ?? FOG_COLOR} near={fog?.near ?? 70} far={fog?.far ?? 260} />
      )}
      {lights ? (
        <>
          <hemisphereLight
            args={[ambient?.skyColor ?? HEMI_SKY, ambient?.groundColor ?? HEMI_GROUND, ambient?.intensity ?? 0.55]}
          />
          <SunLight direction={sunPosition} intensity={sun?.intensity ?? 0.85} color={sun?.color ?? SUN_COLOR} />
        </>
      ) : null}
    </>
  );
}

export interface SkyDaylightProps {
  sky: SkyEnvironmentDescriptor;
  lights?: boolean;
  /** Terrain `biomeBands`; when any carries `fog`/`sky`, fog and dome cross-fade per camera z. */
  bands?: readonly BiomeBand[];
}

/** True when at least one band overrides fog or sky — the trigger for the per-frame biome driver. */
function bandsDriveSkyOrFog(bands: readonly BiomeBand[] | undefined): bands is readonly BiomeBand[] {
  return bands !== undefined && bands.some((band) => band.fog !== undefined || band.sky !== undefined);
}

/** Renders a fixed sky/sun/fog look sampled from `sky`'s preset (or, when `timeOfDay` is on but no clock drives it, its noon look). No per-frame updates.
 * @internal
 */
export function SkyDaylight({ sky, lights = true, bands }: SkyDaylightProps) {
  if (bandsDriveSkyOrFog(bands)) return <BiomeDaylight sky={sky} bands={bands} lights={lights} />;
  return <StaticSkyDaylight sky={sky} lights={lights} />;
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

function StaticSkyDaylight({ sky, lights }: { sky: SkyEnvironmentDescriptor; lights: boolean }) {
  const state = useMemo(() => daylightStateAt(SKY_PRESET_DAY_FRACTION[sky.preset], sky), [sky]);
  return (
    <Daylight
      sky={{ topColor: state.skyTop, horizonColor: state.skyBottom, ...skyDomeShape(sky) }}
      fog={{ color: sky.fog?.color ?? state.background, near: sky.fog?.near, far: sky.fog?.far }}
      sun={{ position: state.sunPosition, intensity: state.sunIntensity }}
      ambient={{ intensity: state.ambientIntensity }}
      lights={lights}
      clouds={sky.volumetricClouds}
    />
  );
}

export interface TimeOfDayDaylightProps {
  sky: SkyEnvironmentDescriptor;
  /** The world's `SimClock` (or a stub exposing `calendar().dayFraction`). Absent means static rendering. */
  clock?: { calendar(): { dayFraction: number } };
  lights?: boolean;
  /** Terrain `biomeBands`; when any carries `fog`/`sky`, fog and dome cross-fade per camera z. */
  bands?: readonly BiomeBand[];
}

/**
 * Drives sky/fog (and optional default lights) from the world clock when `sky.timeOfDay` and `clock`
 * are both present. Authored `PlayableGame.lighting` is never rewritten — pass `lights={false}` so
 * only dome colors and fog track the day fraction.
  * @internal
  */
export function TimeOfDayDaylight({ sky, clock, lights = true, bands }: TimeOfDayDaylightProps) {
  if (bandsDriveSkyOrFog(bands)) return <BiomeDaylight sky={sky} bands={bands} clock={clock} lights={lights} />;
  if (!sky.timeOfDay || clock === undefined) return <SkyDaylight sky={sky} lights={lights} />;
  return <DrivenDaylight sky={sky} clock={clock} lights={lights} />;
}

/**
 * Per-frame biome fog/sky driver: cross-fades fog color/range, dome colors, and sun/ambient intensity
 * along the camera's z through the terrain's `biomeBands`. Base look is the sky preset (or, when
 * `sky.timeOfDay` and a `clock` are present, the live day fraction); bands ride on top.
 */
function BiomeDaylight({
  sky,
  bands,
  clock,
  lights,
}: {
  sky: SkyEnvironmentDescriptor;
  bands: readonly BiomeBand[];
  clock?: { calendar(): { dayFraction: number } };
  lights: boolean;
}) {
  const timeOfDay = sky.timeOfDay && clock !== undefined;
  const baseFraction = timeOfDay ? clock!.calendar().dayFraction : SKY_PRESET_DAY_FRACTION[sky.preset];
  const initial = useMemo(() => daylightStateAt(baseFraction, sky), [sky, baseFraction]);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const sunDirectionRef = useRef<readonly [number, number, number]>(initial.sunPosition);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const skyMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  const fogFallback = useMemo(
    () => ({
      color: sky.fog?.color ?? initial.background,
      near: sky.fog?.near ?? 70,
      far: sky.fog?.far ?? 260,
      density: 0,
    }),
    [sky.fog?.color, sky.fog?.near, sky.fog?.far, initial.background],
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

  useFrame((state) => {
    const base = timeOfDay ? daylightStateAt(clock!.calendar().dayFraction, sky) : initial;
    const z = state.camera.position.z;
    const fog = fogSampler(z);
    const skyValue = skySampler(z);
    const fogNode = fogRef.current;
    if (fogNode !== null) {
      setSkyFogColor(fogNode, fog.color);
      fogNode.near = fog.near;
      fogNode.far = fog.far;
    }
    const skyMaterial = skyMaterialRef.current;
    if (skyMaterial !== null) {
      setSkyDomeColors(skyMaterial, skyValue.zenithColor, skyValue.horizonColor);
      aimSkySun(skyMaterial, base.sunPosition);
    }
    sunDirectionRef.current = base.sunPosition;
    const sun = sunRef.current;
    if (sun !== null) sun.intensity = skyValue.sunIntensity;
    const hemi = hemiRef.current;
    if (hemi !== null) hemi.intensity = skyValue.ambientIntensity;
  });

  return (
    <>
      <SkyDome
        topColor={initial.skyTop}
        horizonColor={initial.skyBottom}
        sunDirection={initial.sunPosition}
        sunColor={SUN_COLOR}
        materialRef={skyMaterialRef}
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
            color={SUN_COLOR}
          />
        </>
      ) : null}
    </>
  );
}

function DrivenDaylight({
  sky,
  clock,
  lights,
}: {
  sky: SkyEnvironmentDescriptor;
  clock: { calendar(): { dayFraction: number } };
  lights: boolean;
}) {
  const initial = useMemo(() => daylightStateAt(clock.calendar().dayFraction, sky), [clock, sky]);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const sunDirectionRef = useRef<readonly [number, number, number]>(initial.sunPosition);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const skyMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  useFrame(() => {
    const state = daylightStateAt(clock.calendar().dayFraction, sky);
    sunDirectionRef.current = state.sunPosition;
    const sun = sunRef.current;
    if (sun !== null) sun.intensity = state.sunIntensity;
    const hemi = hemiRef.current;
    if (hemi !== null) hemi.intensity = state.ambientIntensity;
    const fog = fogRef.current;
    if (fog !== null) setSkyFogColor(fog, sky.fog?.color ?? state.background);
    const skyMaterial = skyMaterialRef.current;
    if (skyMaterial !== null) {
      setSkyDomeColors(skyMaterial, state.skyTop, state.skyBottom);
      aimSkySun(skyMaterial, state.sunPosition);
    }
  });

  return (
    <>
      <SkyDome
        topColor={initial.skyTop}
        horizonColor={initial.skyBottom}
        sunDirection={initial.sunPosition}
        sunColor={SUN_COLOR}
        materialRef={skyMaterialRef}
        {...skyDomeShape(sky)}
      />
      {sky.volumetricClouds === undefined ? null : (
        <VolumetricClouds rules={resolveVolumetricClouds(sky.volumetricClouds)} sunDirection={initial.sunPosition} />
      )}
      <SkyFog fogRef={fogRef} color={sky.fog?.color ?? initial.background} near={sky.fog?.near ?? 70} far={sky.fog?.far ?? 260} />
      {lights ? (
        <>
          <hemisphereLight ref={hemiRef} args={[HEMI_SKY, HEMI_GROUND, initial.ambientIntensity]} />
          <SunLight direction={initial.sunPosition} directionRef={sunDirectionRef} lightRef={sunRef} intensity={initial.sunIntensity} color={SUN_COLOR} />
        </>
      ) : null}
    </>
  );
}
