import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type WeatherVector = readonly [number, number, number];

export interface WeatherUniformSet {
  time: THREE.IUniform<number>;
  wind: THREE.IUniform<THREE.Vector3>;
  lightning: THREE.IUniform<number>;
}

export interface WeatherUniformOptions {
  wind?: WeatherVector;
  lightning?: number;
  timeScale?: number;
}

const WeatherUniformContext = createContext<WeatherUniformSet | null>(null);

export function createWeatherUniformSet(options: WeatherUniformOptions = {}): WeatherUniformSet {
  const wind = options.wind ?? [0, 0, 0];
  return {
    time: { value: 0 },
    wind: { value: new THREE.Vector3(wind[0], wind[1], wind[2]) },
    lightning: { value: options.lightning ?? 0 },
  };
}

function useUniformTicker(uniforms: WeatherUniformSet, options: WeatherUniformOptions, enabled = true) {
  useFrame((_state, delta) => {
    if (!enabled) return;
    const wind = options.wind ?? [0, 0, 0];
    uniforms.time.value += delta * (options.timeScale ?? 1);
    uniforms.wind.value.set(wind[0], wind[1], wind[2]);
    uniforms.lightning.value = options.lightning ?? 0;
  });
}

export function WeatherUniformProvider({ children, ...options }: WeatherUniformOptions & { children: ReactNode }) {
  const uniforms = useMemo(() => createWeatherUniformSet(options), []);
  useUniformTicker(uniforms, options);
  return <WeatherUniformContext.Provider value={uniforms}>{children}</WeatherUniformContext.Provider>;
}

export function useWeatherUniformSet(options: WeatherUniformOptions = {}): WeatherUniformSet {
  const shared = useContext(WeatherUniformContext);
  const local = useMemo(() => createWeatherUniformSet(options), []);
  useUniformTicker(local, options, shared === null);
  return shared ?? local;
}
