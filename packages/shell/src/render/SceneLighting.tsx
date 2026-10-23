import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import type { DirectionalLight } from "three";

import type {
  BackdropConfig,
  DirectionalLightingConfig,
  LightingConfig,
  PointLightingConfig,
  SpotLightingConfig,
} from "@jgengine/core/game/playableGame";
import type { GraphicsProfile } from "@jgengine/core/settings/graphicsProfile";
import { devtools } from "@jgengine/core/devtools/devtools";

import { CascadedShadows, DEFAULT_SHADOW_RADIUS } from "./CascadedShadows";
import { cullSmallShadowCasters, MIN_SHADOW_CASTER_RADIUS, type ShadowCasterCull } from "./shadowCasters";
import { minShadowCasterRadius, resolveCascadeCount, resolveShadowMapSize, SHADOW_CASTER_RADIUS_REFERENCE_MAP } from "./shadowTiers";

const DEFAULT_BACKDROP_FOG_COLOR = "#1a1c22";
/** Default cap for combined dynamic point and spot lights. */
export const POINT_LIGHT_BUDGET = 8;

/**
 * Per-frame scaling a day cycle applies to a game's authored sun and ambient fill, so an authored
 * sun sets and a moon rises instead of the world staying lit like noon after dark. `sunFactor` and
 * `ambientFactor` are 1 at the authored noon peak; colors come from the atmosphere.
 * @internal
 */
export interface DaylightModulation {
  sunFactor: number;
  sunColor: string;
  ambientFactor: number;
}

/** @internal Clamp point lights for the runtime budget. */
export function resolvePointLightBudget(entries: readonly PointLightingConfig[] | undefined): readonly PointLightingConfig[] {
  if (entries === undefined || entries.length <= POINT_LIGHT_BUDGET) return entries ?? [];
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[jgengine:lighting] ${entries.length} point lights requested — clamped to budget ${POINT_LIGHT_BUDGET}`);
  }
  return entries.slice(0, POINT_LIGHT_BUDGET);
}

function resolveDynamicLights(lighting: LightingConfig): { point: readonly PointLightingConfig[]; spot: readonly SpotLightingConfig[] } {
  const point = lighting.point ?? [];
  const spot = lighting.spot ?? [];
  const budget = Math.max(0, Math.floor(lighting.maxDynamicLights ?? POINT_LIGHT_BUDGET));
  if (point.length + spot.length <= budget) return { point, spot };
  if (typeof console !== "undefined" && typeof console.warn === "function") console.warn(`[jgengine:lighting] ${point.length + spot.length} dynamic lights requested — clamped to budget ${budget}`);
  return { point: point.slice(0, budget), spot: spot.slice(0, Math.max(0, budget - point.length)) };
}

function usesCascades(entry: DirectionalLightingConfig): boolean {
  return (entry.castShadow ?? false) && (entry.cascades ?? 1) > 1;
}

function DirectionalShadowLight({ entry, profile, modulation }: { entry: DirectionalLightingConfig; profile?: GraphicsProfile; modulation?: DaylightModulation }) {
  const resolved = profile === undefined
    ? entry
    : {
        ...entry,
        shadowMapSize: resolveShadowMapSize(profile, entry.shadowMapSize),
        cascades: resolveCascadeCount(profile, entry.cascades),
      };
  if (usesCascades(resolved)) {
    return <CascadedShadows entry={resolved} profile={profile} modulation={modulation} />;
  }
  return <SingleShadowLight entry={resolved} modulation={modulation} />;
}

/**
 * Refresh a directional light's shadow projection after its frustum bounds change.
 * R3F pierced `shadow-camera-*` props write the bounds but never call
 * `updateProjectionMatrix()`, so depth renders with the stale default ~10×10 box
 * and `shadowCameraSize` is silently inert.
 */
export function syncShadowProjection(light: DirectionalLight): void {
  light.shadow.camera.updateProjectionMatrix();
}

function SingleShadowLight({ entry, modulation }: { entry: DirectionalLightingConfig; modulation?: DaylightModulation }) {
  const lightRef = useRef<DirectionalLight>(null);
  const size = entry.shadowCameraSize ?? 40;
  const far = Math.max(200, size * 6);
  const mapSize = entry.shadowMapSize ?? 1024;
  const baseIntensity = entry.intensity ?? 1.3;
  useFrame(() => {
    const light = lightRef.current;
    if (light === null || modulation === undefined) return;
    light.intensity = baseIntensity * modulation.sunFactor;
    light.color.set(modulation.sunColor);
  });
  useLayoutEffect(() => {
    if (lightRef.current !== null) syncShadowProjection(lightRef.current);
  }, [size, far]);
  useLayoutEffect(() => {
    const light = lightRef.current;
    if (light === null || light.shadow.map === null) return;
    light.shadow.map.dispose();
    light.shadow.map = null;
  }, [mapSize]);
  return (
    <directionalLight
      ref={lightRef}
      position={[entry.position[0], entry.position[1], entry.position[2]]}
      intensity={entry.intensity ?? 1.3}
      color={entry.color}
      castShadow={entry.castShadow ?? false}
      shadow-mapSize-width={mapSize}
      shadow-mapSize-height={mapSize}
      shadow-camera-left={-size}
      shadow-camera-right={size}
      shadow-camera-top={size}
      shadow-camera-bottom={-size}
      shadow-camera-near={0.5}
      shadow-camera-far={far}
      shadow-bias={entry.shadowBias ?? -0.0004}
      shadow-normalBias={entry.shadowNormalBias ?? 0.02}
      shadow-radius={entry.shadowRadius ?? DEFAULT_SHADOW_RADIUS}
    />
  );
}

export function ConfiguredLighting({
  lighting,
  profile,
  modulation,
}: {
  lighting: LightingConfig;
  profile?: GraphicsProfile;
  /** Day-cycle scaling for the first directional (the sun) and the ambient fill. */
  modulation?: DaylightModulation;
}) {
  const dynamic = resolveDynamicLights(lighting);
  const scene = useThree((s) => s.scene);
  const shadowsCast = (lighting.directional ?? []).some((entry) => entry.castShadow === true);
  const cullRef = useRef<ShadowCasterCull | null>(null);
  const casterRadius = minShadowCasterRadius(
    profile?.shadowMapSize ?? SHADOW_CASTER_RADIUS_REFERENCE_MAP,
    MIN_SHADOW_CASTER_RADIUS,
  );
  useEffect(() => {
    if (!shadowsCast) return;
    const cull = cullSmallShadowCasters(scene, casterRadius);
    cullRef.current = cull;
    return () => {
      cull.restore();
      cullRef.current = null;
    };
  }, [scene, shadowsCast, casterRadius]);
  useEffect(
    () =>
      devtools.probes.registerSystem("render/shadows", {
        counters: () => cullRef.current?.stats() ?? { casters: 0, skipped: 0, minRadius: casterRadius },
        state: () => {
          const stats = cullRef.current?.stats();
          return stats === undefined
            ? "no shadow-casting directional light"
            : `${stats.casters} casters · ${stats.skipped} under ${stats.minRadius} m skipped`;
        },
      }),
    [casterRadius],
  );
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const baseAmbient = lighting.ambient?.intensity ?? 0.55;
  const baseHemisphere = lighting.hemisphere?.intensity ?? 0.55;
  useFrame(() => {
    if (modulation === undefined) return;
    if (ambientRef.current !== null) ambientRef.current.intensity = baseAmbient * modulation.ambientFactor;
    if (hemisphereRef.current !== null) hemisphereRef.current.intensity = baseHemisphere * modulation.ambientFactor;
  });
  return (
    <>
      {lighting.ambient !== undefined ? (
        <ambientLight ref={ambientRef} color={lighting.ambient.color} intensity={baseAmbient} />
      ) : null}
      {lighting.hemisphere !== undefined ? (
        <hemisphereLight
          ref={hemisphereRef}
          args={[
            lighting.hemisphere.skyColor ?? "#bfe3ff",
            lighting.hemisphere.groundColor ?? "#4c6b34",
            baseHemisphere,
          ]}
        />
      ) : null}
      {(lighting.directional ?? []).map((entry, index) => (
        <DirectionalShadowLight key={index} entry={entry} profile={profile} {...(index === 0 && modulation !== undefined ? { modulation } : {})} />
      ))}
      {dynamic.point.map((entry, index) => (
        <pointLight
          key={index}
          position={[entry.position[0], entry.position[1], entry.position[2]]}
          intensity={entry.intensity ?? 1}
          color={entry.color}
          distance={entry.distance ?? 0}
          decay={entry.decay ?? 2}
          castShadow={entry.castShadow ?? false}
        />
      ))}
      {dynamic.spot.map((entry, index) => (
        <spotLight key={index} position={[entry.position[0], entry.position[1], entry.position[2]]} intensity={entry.intensity ?? 1} color={entry.color} distance={entry.distance ?? 0} decay={entry.decay ?? 2} angle={entry.angle ?? Math.PI / 6} penumbra={entry.penumbra ?? 0} castShadow={entry.castShadow ?? false} target-position={[...(entry.target ?? [0, 0, 0])]} />
      ))}
    </>
  );
}

export function BackdropFog({ fog }: { fog: BackdropConfig["fog"] }) {
  if (fog === undefined) return null;
  return fog.density !== undefined ? (
    <fogExp2 attach="fog" args={[fog.color ?? DEFAULT_BACKDROP_FOG_COLOR, fog.density]} />
  ) : (
    <fog attach="fog" args={[fog.color ?? DEFAULT_BACKDROP_FOG_COLOR, fog.near ?? 10, fog.far ?? 200]} />
  );
}
