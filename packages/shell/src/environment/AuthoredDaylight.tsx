import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { SkyEnvironmentDescriptor } from "@jgengine/core/world/features";

import type { DaylightModulation } from "../render/SceneLighting";
import { MoonLight } from "./Daylight";
import { daylightStateAt, DEFAULT_DAY_AMBIENT_INTENSITY, DEFAULT_DAY_SUN_INTENSITY } from "./daylightCycle";

/** Props for {@link AuthoredDaylight}: the authored sky whose values are the noon keyframe, the world clock, and the holder configured lights read. */
export interface AuthoredDaylightProps {
  /** The authored sky; its `sunIntensity`/`ambientIntensity` are the noon peak the cycle scales from. */
  sky: SkyEnvironmentDescriptor;
  /** The world's `SimClock` (or a stub exposing `calendar().dayFraction`). */
  clock: { calendar(): { dayFraction: number } };
  /** Mutable holder the shell's configured lights read every frame. */
  modulation: DaylightModulation;
}

/**
 * Drives authored `PlayableGame.lighting` from the day cycle: it scales the first directional (the
 * sun) and the ambient fill between the authored noon peak and night, retints the sun, and mounts
 * the moon. Without it a time-of-day sky only repaints the dome, so the ground keeps its midday key
 * light after dark — a black sky over a sunlit city.
 *
 * The authored values stay the noon keyframe, mirroring how `horizonColor`/`zenithColor` already
 * work, so art direction still owns how bright noon is.
 *
 * @capability day-night-sky let an authored sun set and a moon rise instead of a fixed midday key light
 * @internal
 */
export function AuthoredDaylight({ sky, clock, modulation }: AuthoredDaylightProps) {
  const initial = useMemo(() => daylightStateAt(clock.calendar().dayFraction, sky), [sky, clock]);
  const noonSun = sky.sunIntensity ?? DEFAULT_DAY_SUN_INTENSITY;
  const noonAmbient = sky.ambientIntensity ?? DEFAULT_DAY_AMBIENT_INTENSITY;
  const moonRef = useRef<THREE.DirectionalLight>(null);
  const moonDirectionRef = useRef<readonly [number, number, number]>(initial.moonPosition);

  useFrame(() => {
    const state = daylightStateAt(clock.calendar().dayFraction, sky);
    modulation.sunFactor = state.sunIntensity / noonSun;
    modulation.sunColor = state.sunColor;
    modulation.ambientFactor = state.ambientIntensity / noonAmbient;
    moonDirectionRef.current = state.moonPosition;
    const moon = moonRef.current;
    if (moon !== null) {
      moon.intensity = state.moonIntensity;
      moon.color.set(state.moonColor);
    }
  });

  return (
    <MoonLight
      direction={initial.moonPosition}
      directionRef={moonDirectionRef}
      lightRef={moonRef}
      intensity={initial.moonIntensity}
      color={initial.moonColor}
    />
  );
}
