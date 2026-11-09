import { useRef } from "react";
import * as THREE from "three";
import { UniformMaterial } from "@jgengine/core/render/uniformMaterial.draw";

import { reportRain, reportWind } from "@jgengine/core/weather/livingWorld.draw";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { createWeatherQuadGeometry } from "./weatherGeometry.draw";
import { DEFAULT_RAIN_COUNT, DEFAULT_RAIN_DENSITY, resolveWeatherInstanceCount } from "./weatherMath";
import { WEATHER_SHELTER_SHADER } from "./weatherShelter.draw";
import {
  createWeatherUniformSet,
  updateWeatherUniformSet,
  useWeatherUniformSet,
  type WeatherUniformOptions,
  type WeatherUniformSet,
  type WeatherVector,
} from "./weatherUniforms.draw";

/** Props for {@link RainField}: drop count, density and budget, area, fall speed, wind and look. */
export interface RainFieldProps {
  count?: number;
  density?: number;
  budget?: number;
  volume?: WeatherVector;
  wind?: WeatherVector;
  origin?: WeatherVector;
  followCamera?: boolean;
  speed?: number;
  length?: number;
  width?: number;
  opacity?: number;
  color?: THREE.ColorRepresentation;
  lightning?: number;
  timeScale?: number;
  timeSeconds?: number | (() => number);
  seed?: number;
  renderOrder?: number;
  frustumCulled?: boolean;
}

const DEFAULT_VOLUME: WeatherVector = [56, 42, 56];
const DEFAULT_ORIGIN: WeatherVector = [0, 0, 0];
const DEFAULT_RAIN_COLOR = "#b8c4d8";

/** How much rain a field reports to the living world, 0..1: the default density is a steady shower. @internal */
export function rainAmount(density: number, localRain: number): number {
  return Math.min(1, (Math.max(0, density) / DEFAULT_RAIN_DENSITY) * 0.8) * localRain;
}

function uniformOptions(props: RainFieldProps): WeatherUniformOptions {
  return { wind: props.wind, lightning: props.lightning, timeScale: props.timeScale, timeSeconds: props.timeSeconds };
}

/**
 * GPU-animated rain streaks around the camera, sheltered under authored roofs.
 * `uniforms` is the resolved shared set (the React path's `useWeatherUniformSet`,
 * already ticked); without it the draw owns a local set and ticks it on the
 * board at weather priority, matching the old local-uniforms path.
 */
export function rainFieldDraw(getProps: () => RainFieldProps, uniforms?: WeatherUniformSet): EngineDraw {
  const source = {};
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.InstancedBufferGeometry | null = null;
  let material: UniformMaterial | null = null;
  let shared: WeatherUniformSet | null = null;
  let leaveTicker = () => {};

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      const count = props.count ?? DEFAULT_RAIN_COUNT;
      const seed = props.seed ?? 11939;
      shared = uniforms ?? createWeatherUniformSet(uniformOptions(props));
      const set = shared;
      geometry = createWeatherQuadGeometry(count, seed);
      material = new UniformMaterial({
        uniforms: {
          uTime: set.time,
          uShelterCenters: set.shelterCenters,
          uShelterShapes: set.shelterShapes,
          uShelterCount: set.shelterCount,
          uWind: set.wind,
          uLightning: set.lightning,
          uAnchor: { value: new THREE.Vector3() },
          uVolume: { value: new THREE.Vector3() },
          uSpeed: { value: props.speed ?? 22 },
          uLength: { value: props.length ?? 1.35 },
          uWidth: { value: props.width ?? 0.018 },
          uOpacity: { value: props.opacity ?? 0.48 },
          uColor: { value: new THREE.Color(props.color ?? DEFAULT_RAIN_COLOR) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        vertexShader: `
        ${WEATHER_SHELTER_SHADER}
        uniform float uTime;
        uniform vec3 uWind;
        uniform vec3 uAnchor;
        uniform vec3 uVolume;
        uniform float uSpeed;
        uniform float uLength;
        uniform float uWidth;

        attribute vec3 aSpawn;
        attribute float aDrift;

        varying float vExposure;
        varying vec2 vUv;
        varying float vDrift;

        void main() {
          vUv = uv;
          vDrift = aDrift;

          vec3 origin = uAnchor - vec3(uVolume.x * 0.5, uVolume.y * 0.85, uVolume.z * 0.5);
          float speed = uSpeed * (0.72 + 0.56 * aDrift);
          vec3 velocity = vec3(uWind.x, -speed, uWind.z);
          vec3 local = aSpawn * uVolume + velocity * uTime;
          vec3 worldCenter = mod(local - origin, uVolume) + origin;
          vExposure = weatherExposure(worldCenter);
          vec3 direction = normalize(velocity);
          vec3 cameraRay = normalize(cameraPosition - worldCenter);
          vec3 sideRaw = cross(direction, cameraRay);
          vec3 side = length(sideRaw) < 0.001 ? vec3(1.0, 0.0, 0.0) : normalize(sideRaw);
          float streak = uLength * (0.68 + 0.64 * aDrift);
          vec3 world = worldCenter + side * position.x * uWidth + direction * position.y * streak;

          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
        fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        uniform float uLightning;

        varying float vExposure;
        varying vec2 vUv;
        varying float vDrift;

        void main() {
          float across = smoothstep(0.0, 0.45, vUv.x) * smoothstep(1.0, 0.55, vUv.x);
          float along = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.58, vUv.y);
          float alpha = across * along * uOpacity * (0.55 + 0.45 * vDrift);
          alpha *= vExposure;
          if (alpha < 0.001) discard;
          vec3 litColor = uColor * (1.0 + uLightning * 2.25);
          gl_FragColor = vec4(litColor, alpha);
        }
      `,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = props.frustumCulled ?? !(props.followCamera ?? true);
      mesh.renderOrder = props.renderOrder ?? 10;
      state.scene.add(mesh);
      if (uniforms === undefined) {
        leaveTicker = joinFrameTask(-1, (frameState, delta) => {
          const p = getProps();
          const position = frameState.camera.position;
          updateWeatherUniformSet(set, uniformOptions(p), delta, position.x, position.z, position.y);
        });
      }
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      const set = shared;
      if (set === null || mesh === null || material === null || geometry === null) return;
      reportRain(source, rainAmount(props.density ?? DEFAULT_RAIN_DENSITY, set.rain.value));
      reportWind(source, [set.wind.value.x, set.wind.value.z]);
      const uniforms = material.uniforms;
      const followCamera = props.followCamera ?? true;
      const origin = props.origin ?? DEFAULT_ORIGIN;
      const target = uniforms.uAnchor.value as THREE.Vector3;
      if (followCamera) target.copy(state.camera.position);
      else target.set(origin[0], origin[1], origin[2]);
      const volume = props.volume ?? DEFAULT_VOLUME;
      uniforms.uVolume.value.set(volume[0], volume[1], volume[2]);
      uniforms.uSpeed.value = props.speed ?? 22;
      uniforms.uLength.value = props.length ?? 1.35;
      uniforms.uWidth.value = props.width ?? 0.018;
      uniforms.uOpacity.value = props.opacity ?? 0.48;
      uniforms.uColor.value.set(props.color ?? DEFAULT_RAIN_COLOR);
      geometry.instanceCount = resolveWeatherInstanceCount(
        props.count ?? DEFAULT_RAIN_COUNT,
        (props.density ?? DEFAULT_RAIN_DENSITY) * set.rain.value,
        props.budget,
      );
      const metrics = set.metrics?.rain;
      if (metrics !== undefined) {
        metrics.count = geometry.instanceCount;
        metrics.capacity = geometry.getAttribute("aSpawn").count;
      }
      mesh.frustumCulled = props.frustumCulled ?? !followCamera;
      mesh.renderOrder = props.renderOrder ?? 10;
    },
    dispose(state: EngineFrameState) {
      leaveTicker();
      leaveTicker = () => {};
      reportRain(source, 0);
      reportWind(source, null);
      if (mesh !== null) state.scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      mesh = null;
      geometry = null;
      material = null;
      shared = null;
    },
  };
}

/** GPU-animated rain streaks around the camera, sheltered under authored roofs. */
export function RainField(props: RainFieldProps) {
  const uniforms = useWeatherUniformSet({
    wind: props.wind,
    lightning: props.lightning,
    timeScale: props.timeScale,
    timeSeconds: props.timeSeconds,
  });
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(
    () => rainFieldDraw(() => latest.current, uniforms),
    [props.count, props.seed, uniforms],
  );
  return null;
}
