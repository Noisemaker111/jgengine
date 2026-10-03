import type { ReactNode } from "react";
import type { EditorVolume } from "@jgengine/core/editor/types";
import type { AuthoredWeatherSample } from "@jgengine/core/world/authoredWeather";

import { DustField, type DustFieldProps } from "./DustField";
import { RainField, type RainFieldProps } from "./RainField";
import { RainImpactField, type RainImpactFieldProps } from "./RainImpactField";
import { SnowField, type SnowFieldProps } from "./SnowField";
import { WeatherUniformProvider, type WeatherVector, type WeatherParticleMetrics } from "./weatherUniforms";

/** `"mixed"` runs rain and snow together; `"dust"` is airborne particulate and composes with either via `dust`. */
export type WeatherLayerMode = "clear" | "rain" | "snow" | "mixed" | "dust";

export interface WeatherLayerProps {
  mode?: WeatherLayerMode;
  intensity?: number;
  wind?: WeatherVector;
  lightning?: number;
  timeScale?: number;
  timeSeconds?: number | (() => number);
  /** Read authored conditions at the camera from the authoritative simulation clock. */
  sample?: (x: number, z: number) => AuthoredWeatherSample;
  shelters?: readonly EditorVolume[];
  metrics?: WeatherParticleMetrics;
  rain?: Omit<RainFieldProps, "wind" | "lightning" | "timeScale"> | false;
  snow?: Omit<SnowFieldProps, "wind" | "timeScale"> | false;
  /** Airborne particulate. Drawn in `"dust"` mode, and alongside rain/snow whenever `dustAlways` is set. */
  dust?: Omit<DustFieldProps, "wind" | "timeScale"> | false;
  /** Keep dust in the air in every mode — a world that is dusty whatever else the sky is doing. */
  dustAlways?: boolean;
  impacts?: RainImpactFieldProps | false;
  enabled?: boolean;
  children?: ReactNode;
}

function clearMetrics(metrics: WeatherParticleMetrics, layer: "rain" | "snow" | "dust" | "impacts"): void {
  metrics[layer].count = 0;
  metrics[layer].capacity = 0;
  if (layer === "impacts") { metrics.impacts.heightQueries = 0; metrics.impacts.exposureQueries = 0; metrics.impacts.queryBudget = 0; }
}

function resolveLayerDensity(value: number | undefined, fallback: number, intensity: number): number {
  return (value ?? fallback) * intensity;
}

export function WeatherLayer({
  mode = "clear",
  intensity = 1,
  wind,
  lightning,
  timeScale,
  timeSeconds,
  sample,
  shelters,
  metrics,
  rain,
  snow,
  dust,
  dustAlways = false,
  impacts,
  enabled = true,
  children,
}: WeatherLayerProps) {
  if (!enabled) {
    if (metrics !== undefined) for (const layer of ["rain", "snow", "dust", "impacts"] as const) clearMetrics(metrics, layer);
    return null;
  }

  const rainProps = rain === false ? null : (rain ?? {});
  const snowProps = snow === false ? null : (snow ?? {});
  const showRain = rainProps !== null && (sample !== undefined || mode === "rain" || mode === "mixed");
  const showSnow = snowProps !== null && (sample !== undefined || mode === "snow" || mode === "mixed");
  const dustProps = dust === false ? null : (dust ?? {});
  const showDust = dustProps !== null && (sample !== undefined || mode === "dust" || dustAlways);

  if (metrics !== undefined) {
    if (!showRain) clearMetrics(metrics, "rain");
    if (!showSnow) clearMetrics(metrics, "snow");
    if (!showDust) clearMetrics(metrics, "dust");
    if (!showRain || impacts === undefined || impacts === false) clearMetrics(metrics, "impacts");
  }

  return (
    <WeatherUniformProvider wind={wind} lightning={lightning} timeScale={timeScale} timeSeconds={timeSeconds} sample={sample} shelters={shelters} metrics={metrics}>
      {showRain ? (
        <RainField {...rainProps} density={resolveLayerDensity(rainProps.density, 0.45, intensity)} />
      ) : null}
      {showSnow ? (
        <SnowField {...snowProps} density={resolveLayerDensity(snowProps.density, 0.5, intensity)} />
      ) : null}
      {showDust ? (
        <DustField {...dustProps} density={resolveLayerDensity(dustProps.density, 0.4, intensity)} />
      ) : null}
      {showRain && impacts !== undefined && impacts !== false ? <RainImpactField {...impacts} /> : null}
      {children}
    </WeatherUniformProvider>
  );
}
