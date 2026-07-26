import type { ReactNode } from "react";

import { DustField, type DustFieldProps } from "./DustField";
import { RainField, type RainFieldProps } from "./RainField";
import { SnowField, type SnowFieldProps } from "./SnowField";
import { WeatherUniformProvider, type WeatherVector } from "./weatherUniforms";

/** `"mixed"` runs rain and snow together; `"dust"` is airborne particulate and composes with either via `dust`. */
export type WeatherLayerMode = "clear" | "rain" | "snow" | "mixed" | "dust";

export interface WeatherLayerProps {
  mode?: WeatherLayerMode;
  intensity?: number;
  wind?: WeatherVector;
  lightning?: number;
  timeScale?: number;
  rain?: Omit<RainFieldProps, "wind" | "lightning" | "timeScale"> | false;
  snow?: Omit<SnowFieldProps, "wind" | "timeScale"> | false;
  /** Airborne particulate. Drawn in `"dust"` mode, and alongside rain/snow whenever `dustAlways` is set. */
  dust?: Omit<DustFieldProps, "wind" | "timeScale"> | false;
  /** Keep dust in the air in every mode — a world that is dusty whatever else the sky is doing. */
  dustAlways?: boolean;
  enabled?: boolean;
  children?: ReactNode;
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
  rain,
  snow,
  dust,
  dustAlways = false,
  enabled = true,
  children,
}: WeatherLayerProps) {
  if (!enabled) return null;

  const rainProps = rain === false ? null : (rain ?? {});
  const snowProps = snow === false ? null : (snow ?? {});
  const showRain = rainProps !== null && (mode === "rain" || mode === "mixed");
  const showSnow = snowProps !== null && (mode === "snow" || mode === "mixed");
  const dustProps = dust === false ? null : (dust ?? {});
  const showDust = dustProps !== null && (mode === "dust" || dustAlways);

  return (
    <WeatherUniformProvider wind={wind} lightning={lightning} timeScale={timeScale}>
      {showRain ? (
        <RainField {...rainProps} density={resolveLayerDensity(rainProps.density, 0.45, intensity)} />
      ) : null}
      {showSnow ? (
        <SnowField {...snowProps} density={resolveLayerDensity(snowProps.density, 0.5, intensity)} />
      ) : null}
      {showDust ? (
        <DustField {...dustProps} density={resolveLayerDensity(dustProps.density, 0.4, intensity)} />
      ) : null}
      {children}
    </WeatherUniformProvider>
  );
}
