import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { EditorVolume } from "@jgengine/core/editor/types";
import { createWeatherShelterUniforms, updateWeatherShelters, type WeatherShelterUniforms } from "./weatherShelter";
import type { AuthoredWeatherSample } from "@jgengine/core/world/authoredWeather";

export type WeatherVector = readonly [number, number, number];

/** Actual procedural weather submissions and per-frame impact query work. */
export interface WeatherParticleMetrics {
  rain: { count: number; capacity: number };
  snow: { count: number; capacity: number };
  dust: { count: number; capacity: number };
  impacts: { count: number; capacity: number; heightQueries: number; exposureQueries: number; queryBudget: number };
}

export interface WeatherUniformSet extends WeatherShelterUniforms {
  time: THREE.IUniform<number>;
  wind: THREE.IUniform<THREE.Vector3>;
  lightning: THREE.IUniform<number>;
  rain: THREE.IUniform<number>;
  snow: THREE.IUniform<number>;
  dust: THREE.IUniform<number>;
  controlsWind: boolean;
  metrics?: WeatherParticleMetrics;
}

export interface WeatherUniformOptions {
  wind?: WeatherVector;
  lightning?: number;
  timeScale?: number;
  /** Absolute authoritative simulation seconds; no render delta is accumulated when supplied. */
  timeSeconds?: number | (() => number);
  sample?: (x: number, z: number) => AuthoredWeatherSample;
  /** The closest 32 authored shelter volumes clip cosmetic particles. */
  shelters?: readonly EditorVolume[];
  /** Opt-in counters read from submitted geometry and actual query calls. */
  metrics?: WeatherParticleMetrics;
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
    controlsWind: options.wind !== undefined || options.sample !== undefined,
    metrics: options.metrics,
  };
}

/** @internal */
export function updateWeatherUniformSet(uniforms: WeatherUniformSet, options: WeatherUniformOptions, delta: number, x = 0, z = 0, y = 0): void {
  const sample = options.sample?.(x, z);
  const explicitTime = sample?.timeSeconds ?? (typeof options.timeSeconds === "function" ? options.timeSeconds() : options.timeSeconds);
  uniforms.time.value = explicitTime ?? uniforms.time.value + delta * (options.timeScale ?? 1);
  const wind = sample === undefined ? options.wind ?? [0, 0, 0] : [sample.wind[0], 0, sample.wind[1]];
  uniforms.wind.value.set(wind[0]!, wind[1]!, wind[2]!);
  uniforms.lightning.value = sample?.lightning ?? options.lightning ?? 0;
  uniforms.rain.value = sample?.rain ?? 1;
  uniforms.snow.value = sample?.snow ?? 1;
  uniforms.dust.value = sample?.dust ?? 1;
  uniforms.controlsWind = options.wind !== undefined || options.sample !== undefined;
  uniforms.metrics = options.metrics;
  updateWeatherShelters(uniforms, options.shelters ?? [], x, y, z);
}

function useUniformTicker(uniforms: WeatherUniformSet, options: WeatherUniformOptions, enabled = true) {
  useFrame((state, delta) => {
    if (!enabled) return;
    updateWeatherUniformSet(uniforms, options, delta, state.camera.position.x, state.camera.position.z, state.camera.position.y);
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
