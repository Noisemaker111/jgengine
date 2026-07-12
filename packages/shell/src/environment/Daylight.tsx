import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import type { SkyEnvironmentDescriptor } from "@jgengine/core/world/features";

import { daylightStateAt, SKY_PRESET_DAY_FRACTION } from "./daylightCycle";

export interface SkyDomeProps {
  topColor?: string;
  horizonColor?: string;
  radius?: number;
  offset?: number;
  exponent?: number;
  /** Exposes the created shader material so a time-of-day driver can mutate its uniforms per frame without recreating it. */
  materialRef?: MutableRefObject<THREE.ShaderMaterial | null>;
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
  materialRef,
}: SkyDomeProps = {}) {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(topColor) },
        bottomColor: { value: new THREE.Color(horizonColor) },
        offset: { value: offset },
        exponent: { value: exponent },
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
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
  }, [topColor, horizonColor, offset, exponent]);
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
      {sky === false ? null : <SkyDome {...(sky ?? {})} />}
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
}

/** Renders a fixed sky/sun/fog look sampled from `sky`'s preset (or, when `timeOfDay` is on but no clock drives it, its noon look). No per-frame updates. */
export function SkyDaylight({ sky, lights = true }: SkyDaylightProps) {
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
}

/**
 * Drives sky/fog (and optional default lights) from the world clock when `sky.timeOfDay` and `clock`
 * are both present. Authored `PlayableGame.lighting` is never rewritten — pass `lights={false}` so
 * only dome colors and fog track the day fraction.
 */
export function TimeOfDayDaylight({ sky, clock, lights = true }: TimeOfDayDaylightProps) {
  if (!sky.timeOfDay || clock === undefined) return <SkyDaylight sky={sky} lights={lights} />;
  return <DrivenDaylight sky={sky} clock={clock} lights={lights} />;
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
