import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import type { BiomeBand, SkyEnvironmentDescriptor } from "@jgengine/core/world/features";
import { createBiomeFogSampler, createBiomeSkySampler } from "@jgengine/core/world/terrain";

import { daylightStateAt, SKY_PRESET_DAY_FRACTION } from "./daylightCycle";

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
 * Sun directional light whose high-resolution shadow camera follows the view each
 * frame, so grounded shadows stay crisp under the player anywhere in a large world
 * instead of only near the origin.
 */
function ShadowCastingSun({
  position,
  intensity,
  color,
}: {
  position: readonly [number, number, number];
  intensity: number;
  color: string;
}) {
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame((state) => {
    const light = ref.current;
    if (light === null) return;
    const cx = state.camera.position.x;
    const cz = state.camera.position.z;
    light.position.set(cx + position[0], position[1], cz + position[2]);
    light.target.position.set(cx, 0, cz);
    light.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={ref}
      position={[position[0], position[1], position[2]]}
      intensity={intensity}
      color={color}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-90}
      shadow-camera-right={90}
      shadow-camera-top={90}
      shadow-camera-bottom={-90}
      shadow-camera-near={10}
      shadow-camera-far={520}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
    />
  );
}

export function SkyDome({
  topColor = SKY_TOP,
  horizonColor = SKY_HORIZON,
  radius = 260,
  offset = 24,
  exponent = 0.65,
  sunDirection,
  sunColor = "#fff4d6",
  sunIntensity = 1,
  materialRef,
}: SkyDomeProps = {}) {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(topColor) },
        bottomColor: { value: new THREE.Color(horizonColor) },
        offset: { value: offset },
        exponent: { value: exponent },
        uSunColor: { value: new THREE.Color(sunColor) },
        uSunDirection: { value: sunDirection === undefined ? new THREE.Vector3(0, 1, 0) : normalizeVec3(sunDirection) },
        uSunIntensity: { value: sunDirection === undefined ? 0 : sunIntensity },
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
          col = mix(col, bottomColor * 1.12, pow(1.0 - h, 6.0) * 0.5);
          vec3 vd = normalize(vWorldPosition);
          vec2 cuv = vd.xz / (max(vd.y, 0.06) + 0.15) * 1.2;
          float clouds = smoothstep(0.52, 0.82, sFbm(cuv));
          float band = smoothstep(0.08, 0.35, dir.y) * smoothstep(1.0, 0.35, dir.y);
          col = mix(col, mix(topColor, vec3(1.0), 0.6), clouds * band * 0.35);
          float sd = max(dot(vd, normalize(uSunDirection)), 0.0);
          float glow = pow(sd, 8.0) * 0.35 + pow(sd, 128.0) * 2.6;
          col += uSunColor * glow * uSunIntensity;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
  }, [topColor, horizonColor, offset, exponent, sunColor, sunDirection, sunIntensity]);
  useEffect(() => {
    if (materialRef !== undefined) materialRef.current = material;
    return () => {
      material.dispose();
      if (materialRef !== undefined) materialRef.current = null;
    };
  }, [material, materialRef]);
  return (
    <mesh material={material} renderOrder={-1}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}

export interface DaylightProps {
  sky?: SkyDomeProps | false;
  fog?: { color?: string; near?: number; far?: number } | false;
  sun?: { position?: readonly [number, number, number]; intensity?: number; color?: string };
  ambient?: { skyColor?: string; groundColor?: string; intensity?: number };
  /** When false, only the sky dome and fog mount — use with authored `PlayableGame.lighting`. Default true. */
  lights?: boolean;
}

export function Daylight({ sky, fog, sun, ambient, lights = true }: DaylightProps = {}) {
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
      {fog === false ? null : (
        <fog attach="fog" args={[fog?.color ?? FOG_COLOR, fog?.near ?? 70, fog?.far ?? 260]} />
      )}
      {lights ? (
        <>
          <hemisphereLight
            args={[ambient?.skyColor ?? HEMI_SKY, ambient?.groundColor ?? HEMI_GROUND, ambient?.intensity ?? 0.55]}
          />
          <ShadowCastingSun
            position={sunPosition}
            intensity={sun?.intensity ?? 0.85}
            color={sun?.color ?? SUN_COLOR}
          />
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

/** Renders a fixed sky/sun/fog look sampled from `sky`'s preset (or, when `timeOfDay` is on but no clock drives it, its noon look). No per-frame updates. */
export function SkyDaylight({ sky, lights = true, bands }: SkyDaylightProps) {
  if (bandsDriveSkyOrFog(bands)) return <BiomeDaylight sky={sky} bands={bands} lights={lights} />;
  return <StaticSkyDaylight sky={sky} lights={lights} />;
}

function StaticSkyDaylight({ sky, lights }: { sky: SkyEnvironmentDescriptor; lights: boolean }) {
  const state = useMemo(() => daylightStateAt(SKY_PRESET_DAY_FRACTION[sky.preset], sky), [sky]);
  return (
    <Daylight
      sky={{ topColor: state.skyTop, horizonColor: state.skyBottom }}
      fog={{ color: sky.fog?.color ?? state.background, near: sky.fog?.near, far: sky.fog?.far }}
      sun={{ position: state.sunPosition, intensity: state.sunIntensity }}
      ambient={{ intensity: state.ambientIntensity }}
      lights={lights}
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
      fogNode.color.set(fog.color);
      fogNode.near = fog.near;
      fogNode.far = fog.far;
    }
    const skyMaterial = skyMaterialRef.current;
    if (skyMaterial !== null) {
      (skyMaterial.uniforms.topColor!.value as THREE.Color).set(skyValue.zenithColor);
      (skyMaterial.uniforms.bottomColor!.value as THREE.Color).set(skyValue.horizonColor);
    }
    const sun = sunRef.current;
    if (sun !== null) {
      sun.position.set(base.sunPosition[0], base.sunPosition[1], base.sunPosition[2]);
      sun.intensity = skyValue.sunIntensity;
    }
    const hemi = hemiRef.current;
    if (hemi !== null) hemi.intensity = skyValue.ambientIntensity;
  });

  return (
    <>
      <SkyDome topColor={initial.skyTop} horizonColor={initial.skyBottom} materialRef={skyMaterialRef} />
      <fog attach="fog" ref={fogRef} args={[fogFallback.color, fogFallback.near, fogFallback.far]} />
      {lights ? (
        <>
          <hemisphereLight ref={hemiRef} args={[HEMI_SKY, HEMI_GROUND, initial.ambientIntensity]} />
          <directionalLight
            ref={sunRef}
            position={initial.sunPosition}
            intensity={initial.sunIntensity}
            color={SUN_COLOR}
            castShadow
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
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const skyMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  useFrame(() => {
    const state = daylightStateAt(clock.calendar().dayFraction, sky);
    const sun = sunRef.current;
    if (sun !== null) {
      sun.position.set(state.sunPosition[0], state.sunPosition[1], state.sunPosition[2]);
      sun.intensity = state.sunIntensity;
    }
    const hemi = hemiRef.current;
    if (hemi !== null) hemi.intensity = state.ambientIntensity;
    const fog = fogRef.current;
    if (fog !== null) fog.color.set(sky.fog?.color ?? state.background);
    const skyMaterial = skyMaterialRef.current;
    if (skyMaterial !== null) {
      (skyMaterial.uniforms.topColor!.value as THREE.Color).set(state.skyTop);
      (skyMaterial.uniforms.bottomColor!.value as THREE.Color).set(state.skyBottom);
    }
  });

  return (
    <>
      <SkyDome topColor={initial.skyTop} horizonColor={initial.skyBottom} materialRef={skyMaterialRef} />
      <fog attach="fog" ref={fogRef} args={[sky.fog?.color ?? initial.background, sky.fog?.near ?? 70, sky.fog?.far ?? 260]} />
      {lights ? (
        <>
          <hemisphereLight ref={hemiRef} args={[HEMI_SKY, HEMI_GROUND, initial.ambientIntensity]} />
          <directionalLight ref={sunRef} position={initial.sunPosition} intensity={initial.sunIntensity} color={SUN_COLOR} castShadow />
        </>
      ) : null}
    </>
  );
}
