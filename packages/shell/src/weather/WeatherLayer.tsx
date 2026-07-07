import type { ReactNode } from "react";

import { RainField, type RainFieldProps } from "./RainField";
import { SnowField, type SnowFieldProps } from "./SnowField";
import { WeatherUniformProvider, type WeatherVector } from "./weatherUniforms";

export type WeatherLayerMode = "clear" | "rain" | "snow" | "mixed";

export interface WeatherLayerProps {
  mode?: WeatherLayerMode;
  intensity?: number;
  wind?: WeatherVector;
  lightning?: number;
  timeScale?: number;
  rain?: Omit<RainFieldProps, "wind" | "lightning" | "timeScale"> | false;
  snow?: Omit<SnowFieldProps, "wind" | "timeScale"> | false;
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
  enabled = true,
  children,
}: WeatherLayerProps) {
  if (!enabled) return null;

  const rainProps = rain === false ? null : (rain ?? {});
  const snowProps = snow === false ? null : (snow ?? {});
  const showRain = rainProps !== null && (mode === "rain" || mode === "mixed");
  const showSnow = snowProps !== null && (mode === "snow" || mode === "mixed");

  return (
    <WeatherUniformProvider wind={wind} lightning={lightning} timeScale={timeScale}>
      {showRain ? (
        <RainField {...rainProps} density={resolveLayerDensity(rainProps.density, 0.45, intensity)} />
      ) : null}
      {showSnow ? (
        <SnowField {...snowProps} density={resolveLayerDensity(snowProps.density, 0.5, intensity)} />
      ) : null}
      {children}
    </WeatherUniformProvider>
  );
}
