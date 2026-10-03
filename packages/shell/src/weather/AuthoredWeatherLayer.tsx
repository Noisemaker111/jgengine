import { useCallback, useEffect, useMemo, useRef } from "react";
import { useGameContext } from "@jgengine/react/provider";
import type { EditorDocument } from "@jgengine/core/editor/types";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { WeatherParticleMetrics } from "./weatherUniforms";
import { warnOnce } from "@jgengine/core/devtools/warnOnce";
import { WEATHER_SHELTER_BUDGET } from "./weatherShelter";
import { WeatherLayer, type WeatherLayerProps } from "./WeatherLayer";

/** Authored weather document and optional precipitation appearance and ground sampling. */
export interface AuthoredWeatherLayerProps {
  document: EditorDocument;
  rain?: WeatherLayerProps["rain"];
  snow?: WeatherLayerProps["snow"];
  dust?: WeatherLayerProps["dust"];
  heightAt?: (x: number, z: number) => number;
  /** Register actual procedural weather pool and impact query counters. */
  diagnostics?: boolean;
}

/** Render pooled precipitation from the same authored document and clock as gameplay.
 * @capability authored-weather-rendering Render authored weather from shared gameplay samples, simulation time and shelter volumes.
 */
export function AuthoredWeatherLayer({ document, rain, snow, dust, heightAt, diagnostics = false }: AuthoredWeatherLayerProps) {
  const ctx = useGameContext();
  const config = document.simulation?.weather;
  const metrics = useRef<WeatherParticleMetrics>({ rain: { count: 0, capacity: 0 }, snow: { count: 0, capacity: 0 }, dust: { count: 0, capacity: 0 }, impacts: { count: 0, capacity: 0, heightQueries: 0, exposureQueries: 0, queryBudget: 0 } });
  const mounted = config !== undefined;
  useEffect(() => {
    if (!diagnostics || !mounted) return;
    return devtools.probes.register("weatherParticles", () => ({ scope: "procedural-weather", ...structuredClone(metrics.current) }));
  }, [diagnostics, mounted]);
  const shelters = useMemo(() => document.volumes.filter((volume) => volume.kind === "shelter"), [document.volumes]);
  useEffect(() => {
    if (shelters.length > WEATHER_SHELTER_BUDGET) warnOnce("weather-shelter-budget", `[jgengine] Weather renders the closest ${WEATHER_SHELTER_BUDGET} of ${shelters.length} shelters; gameplay uses all authored shelters.`);
  }, [shelters.length]);
  const sample = useCallback((x: number, z: number) => ctx.environment.sample(x, z), [ctx.environment]);
  const exposureAt = useCallback((x: number, y: number, z: number) => ctx.environment.exposureAt(x, y, z), [ctx.environment]);
  if (config === undefined) return null;
  return <WeatherLayer sample={sample} metrics={diagnostics ? metrics.current : undefined} shelters={shelters} rain={rain} snow={snow} dust={dust} impacts={heightAt === undefined ? false : { heightAt, exposureAt }} />;
}
