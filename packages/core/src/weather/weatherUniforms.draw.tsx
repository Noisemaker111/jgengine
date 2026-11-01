import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { reportWind } from "./livingWorld.draw";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { EditorVolume } from "@jgengine/core/editor/types";
import { createWeatherShelterUniforms, updateWeatherShelters, type WeatherShelterUniforms } from "./weatherShelter.draw";
import type { AuthoredWeatherSample } from "@jgengine/core/weather/authoredWeather";
import type { WindField } from "@jgengine/core/world/wind";

/** An `[x, y, z]` world vector, such as the wind. */
export type WeatherVector = readonly [number, number, number];

/** Actual procedural weather submissions and per-frame impact query work. */
export interface WeatherParticleMetrics {
  rain: { count: number; capacity: number };
  snow: { count: number; capacity: number };
  dust: { count: number; capacity: number };
  impacts: { count: number; capacity: number; heightQueries: number; exposureQueries: number; queryBudget: number };
}

/** Uniforms every weather field shares: time, wind, lightning flash, rain, snow and dust amounts, and roof shelters. */
export interface WeatherUniformSet extends WeatherShelterUniforms {
  time: THREE.IUniform<number>;
  wind: THREE.IUniform<THREE.Vector3>;
  lightning: THREE.IUniform<number>;
  rain: THREE.IUniform<number>;
  snow: THREE.IUniform<number>;
  dust: THREE.IUniform<number>;
  controlsWind: boolean;
  metrics?: WeatherParticleMetrics | undefined;
}

/** Options for the shared weather uniforms: wind, lightning, time scale or an authoritative clock, and an authored weather sampler. */
export interface WeatherUniformOptions {
  wind?: WeatherVector | undefined;
  lightning?: number | undefined;
  timeScale?: number | undefined;
  /** Absolute authoritative simulation seconds; no render delta is accumulated when supplied. */
  timeSeconds?: number | (() => number) | undefined;
  sample?: ((x: number, z: number) => AuthoredWeatherSample) | undefined;
  /** The closest 32 authored shelter volumes clip cosmetic particles. */
  shelters?: readonly EditorVolume[] | undefined;
  /** Opt-in counters read from submitted geometry and actual query calls. */
  metrics?: WeatherParticleMetrics | undefined;
  /** The shared wind, read at the camera {@link WEATHER_WIND_SAMPLE_HEIGHT} up each frame; `wind` and `sample` win over it. */
  windField?: WindField | undefined;
}

/** Height, m, precipitation reads the shared wind at: the meteorological 10 m. */
export const WEATHER_WIND_SAMPLE_HEIGHT = 10;

/** The wind precipitation drifts with: an authored sample, a fixed vector, else the shared field at the camera. @internal */
export function weatherWindAt(options: WeatherUniformOptions, sample: AuthoredWeatherSample | undefined, x: number, z: number, time: number): WeatherVector {
  if (sample !== undefined) return [sample.wind[0], 0, sample.wind[1]];
  if (options.wind !== undefined) return options.wind;
  if (options.windField !== undefined) {
    const [wx, wz] = options.windField.atHeight(x, z, WEATHER_WIND_SAMPLE_HEIGHT, time);
    return [wx, 0, wz];
  }
  return [0, 0, 0];
}

const WeatherUniformContext = createContext<WeatherUniformSet | null>(null);

/** @internal */
export function createWeatherUniformSet(options: WeatherUniformOptions = {}): WeatherUniformSet {
  const wind = options.wind ?? [0, 0, 0];
  return {
    ...createWeatherShelterUniforms(),
    time: { value: typeof options.timeSeconds === "function" ? options.timeSeconds() : options.timeSeconds ?? 0 },
    wind: { value: new THREE.Vector3(wind[0], wind[1], wind[2]) },
    lightning: { value: options.lightning ?? 0 },
    rain: { value: options.sample === undefined ? 1 : 0 },
    snow: { value: options.sample === undefined ? 1 : 0 },
    dust: { value: options.sample === undefined ? 1 : 0 },
    controlsWind: options.wind !== undefined || options.sample !== undefined || options.windField !== undefined,
    metrics: options.metrics,
  };
}

/** @internal */
export function updateWeatherUniformSet(uniforms: WeatherUniformSet, options: WeatherUniformOptions, delta: number, x = 0, z = 0, y = 0): void {
  const sample = options.sample?.(x, z);
  const explicitTime = sample?.timeSeconds ?? (typeof options.timeSeconds === "function" ? options.timeSeconds() : options.timeSeconds);
  uniforms.time.value = explicitTime ?? uniforms.time.value + delta * (options.timeScale ?? 1);
  const wind = weatherWindAt(options, sample, x, z, uniforms.time.value);
  uniforms.wind.value.set(wind[0], wind[1], wind[2]);
  uniforms.lightning.value = sample?.lightning ?? options.lightning ?? 0;
  uniforms.rain.value = sample?.rain ?? 1;
  uniforms.snow.value = sample?.snow ?? 1;
  uniforms.dust.value = sample?.dust ?? 1;
  uniforms.controlsWind = options.wind !== undefined || options.sample !== undefined || options.windField !== undefined;
  uniforms.metrics = options.metrics;
  updateWeatherShelters(uniforms, options.shelters ?? [], x, y, z);
}

function useUniformTicker(uniforms: WeatherUniformSet, options: WeatherUniformOptions, enabled = true) {
  // A shared wind field reaches foliage even with no precipitation drawn: trees sway with the same wind.
  const fieldWind = enabled && options.windField !== undefined && options.wind === undefined && options.sample === undefined;
  useEffect(() => (fieldWind ? () => reportWind(uniforms, null) : undefined), [uniforms, fieldWind]);
  useFrame((state, delta) => {
    if (!enabled) return;
    updateWeatherUniformSet(uniforms, options, delta, state.camera.position.x, state.camera.position.z, state.camera.position.y);
    if (fieldWind) reportWind(uniforms, [uniforms.wind.value.x, uniforms.wind.value.z]);
  }, -1);
}

/** @internal */
export function WeatherUniformProvider({ children, ...options }: WeatherUniformOptions & { children: ReactNode }) {
  const uniforms = useMemo(() => createWeatherUniformSet(options), []);
  useUniformTicker(uniforms, options);
  return <WeatherUniformContext.Provider value={uniforms}>{children}</WeatherUniformContext.Provider>;
}

/** @internal */
export function useWeatherUniformSet(options: WeatherUniformOptions = {}): WeatherUniformSet {
  const shared = useContext(WeatherUniformContext);
  const local = useMemo(() => createWeatherUniformSet(options), []);
  useUniformTicker(local, options, shared === null || (!shared.controlsWind && options.wind !== undefined));
  const inherited = useMemo(() => shared === null ? local : { ...shared, wind: local.wind }, [shared, local]);
  return shared === null ? local : !shared.controlsWind && options.wind !== undefined ? inherited : shared;
}
