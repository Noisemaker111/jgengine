import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { DayNightCycle } from "@jgengine/core/time/dayNightCycle";

import { SkyDome } from "./Daylight";
import { daylightStateAt } from "./daylightCycle";

const HEMI_GROUND = "#4c6b34";

/** Props for {@link DayNightSky}: the cycle to bind plus optional dome shape and light-strength knobs. */
export interface DayNightSkyProps {
  /** The serializable day-night brain. Its `sample()` drives the sky tint/light each frame. */
  cycle: DayNightCycle;
  /** Sky dome radius. Default `260`. */
  radius?: number;
  /** Horizon haze-band strength passed straight to the dome. Default `0.5`. */
  hazeStrength?: number;
  /** Sun-glow brightness passed straight to the dome. Default `1`. */
  sunGlowStrength?: number;
  /**
   * Mount a hemisphere + shadow-casting directional light whose color and intensity
   * track the cycle. Turn off (`false`) when the game authors its own `lighting`. Default `true`.
   */
  lights?: boolean;
  /** Peak directional-light intensity at full `sample().intensity` (1). Default `1.1`. */
  keyLightIntensity?: number;
  /** Peak hemisphere (ambient) intensity at full `sample().intensity` (1). Default `0.6`. */
  ambientIntensity?: number;
}

/**
 * Binds a {@link DayNightCycle} to the engine's existing `SkyDome` shader and a pair of
 * lights: each frame it reads `cycle.sample()` and writes the blended tint into the dome's
 * top/horizon/sun uniforms while the sun's arc comes from the shared `daylightStateAt`
 * geometry. This is the turnkey presentation seam — a game mounts this one component in its
 * scene and gets a moving, color-graded day-night sky from the serializable model, with no
 * hand-rolled per-frame lerp and no new renderer. The cycle's `phase`/color values are
 * free-form and never interpreted here.
 *
 * @capability day-night-sky drop-in R3F presenter that drives the engine's existing sky dome and lights from a serializable day-night cycle for a moving, color-graded day-night look
 */
export function DayNightSky({
  cycle,
  radius,
  hazeStrength,
  sunGlowStrength,
  lights = true,
  keyLightIntensity = 1.1,
  ambientIntensity = 0.6,
}: DayNightSkyProps) {
  const skyMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  const initial = useMemo(() => cycle.sample(), [cycle]);
  const initialSun = useMemo(() => daylightStateAt(initial.dayFraction).sunPosition, [initial.dayFraction]);

  useFrame(() => {
    const sample = cycle.sample();
    const geometry = daylightStateAt(sample.dayFraction);

    const material = skyMaterialRef.current;
    if (material !== null) {
      (material.uniforms.topColor!.value as THREE.Color).set(sample.lightColor);
      (material.uniforms.bottomColor!.value as THREE.Color).set(sample.color);
      (material.uniforms.uSunColor!.value as THREE.Color).set(sample.lightColor);
      (material.uniforms.uSunDirection!.value as THREE.Vector3)
        .set(geometry.sunPosition[0], geometry.sunPosition[1], geometry.sunPosition[2])
        .normalize();
      material.uniforms.uSunIntensity!.value = sample.intensity;
    }

    const sun = sunRef.current;
    if (sun !== null) {
      sun.position.set(geometry.sunPosition[0], geometry.sunPosition[1], geometry.sunPosition[2]);
      sun.intensity = sample.intensity * keyLightIntensity;
      sun.color.set(sample.lightColor);
    }
    const hemi = hemiRef.current;
    if (hemi !== null) {
      hemi.intensity = sample.intensity * ambientIntensity;
      hemi.color.set(sample.lightColor);
    }
  });

  return (
    <>
      <SkyDome
        topColor={initial.lightColor}
        horizonColor={initial.color}
        sunDirection={initialSun}
        sunColor={initial.lightColor}
        sunIntensity={initial.intensity}
        materialRef={skyMaterialRef}
        {...(radius === undefined ? {} : { radius })}
        {...(hazeStrength === undefined ? {} : { hazeStrength })}
        {...(sunGlowStrength === undefined ? {} : { sunGlowStrength })}
      />
      {lights ? (
        <>
          <hemisphereLight ref={hemiRef} args={[initial.lightColor, HEMI_GROUND, initial.intensity * ambientIntensity]} />
          <directionalLight
            ref={sunRef}
            position={initialSun}
            intensity={initial.intensity * keyLightIntensity}
            color={initial.lightColor}
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
        </>
      ) : null}
    </>
  );
}
