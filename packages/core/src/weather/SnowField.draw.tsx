import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { UniformMaterial } from "@jgengine/core/render/uniformMaterial.draw";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { createWeatherQuadGeometry } from "./weatherGeometry.draw";
import { DEFAULT_SNOW_COUNT, DEFAULT_SNOW_DENSITY, resolveWeatherInstanceCount } from "./weatherMath";
import { WEATHER_SHELTER_SHADER } from "./weatherShelter.draw";
import {
  createWeatherUniformSet,
  updateWeatherUniformSet,
  useWeatherUniformSet,
  type WeatherUniformOptions,
  type WeatherUniformSet,
  type WeatherVector,
} from "./weatherUniforms.draw";

/** Props for {@link SnowField}: flake count, density and budget, area, fall speed, wind and look. */
export interface SnowFieldProps {
  count?: number;
  density?: number;
  budget?: number;
  volume?: WeatherVector;
  wind?: WeatherVector;
  origin?: WeatherVector;
  followCamera?: boolean;
  speed?: number;
  size?: number;
  sway?: number;
  opacity?: number;
  color?: THREE.ColorRepresentation;
  timeScale?: number;
  timeSeconds?: number | (() => number);
  seed?: number;
  renderOrder?: number;
  frustumCulled?: boolean;
}

const DEFAULT_VOLUME: WeatherVector = [52, 38, 52];
const DEFAULT_ORIGIN: WeatherVector = [0, 0, 0];
const DEFAULT_SNOW_COLOR = "#ffffff";

function uniformOptions(props: SnowFieldProps): WeatherUniformOptions {
  return { wind: props.wind, timeScale: props.timeScale, timeSeconds: props.timeSeconds };
}

type SnowMaterialUniforms = {
  uTime: WeatherUniformSet["time"];
  uShelterCenters: WeatherUniformSet["shelterCenters"];
  uShelterShapes: WeatherUniformSet["shelterShapes"];
  uShelterCount: WeatherUniformSet["shelterCount"];
  uWind: WeatherUniformSet["wind"];
  uAnchor: { value: THREE.Vector3 };
  uVolume: { value: THREE.Vector3 };
  uSpeed: { value: number };
  uSize: { value: number };
  uSway: { value: number };
  uOpacity: { value: number };
  uColor: { value: THREE.Color };
};

/**
 * GPU-animated drifting snowflakes around the camera, sheltered under authored roofs.
 * `uniforms` is the resolved shared set (the React path's `useWeatherUniformSet`,
 * already ticked); without it the draw owns a local set and ticks it on the
 * board at weather priority, matching the old local-uniforms path.
 */
export function snowFieldDraw(getProps: () => SnowFieldProps, uniforms?: WeatherUniformSet): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.InstancedBufferGeometry | null = null;
  let material: UniformMaterial<SnowMaterialUniforms> | null = null;
  let shared: WeatherUniformSet | null = null;
  let leaveTicker = () => {};

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      const count = props.count ?? DEFAULT_SNOW_COUNT;
      const seed = props.seed ?? 72931;
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
          uAnchor: { value: new THREE.Vector3() },
          uVolume: { value: new THREE.Vector3() },
          uSpeed: { value: props.speed ?? 3.2 },
          uSize: { value: props.size ?? 0.11 },
          uSway: { value: props.sway ?? 0.62 },
          uOpacity: { value: props.opacity ?? 0.86 },
          uColor: { value: new THREE.Color(props.color ?? DEFAULT_SNOW_COLOR) },
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
        uniform float uSize;
        uniform float uSway;

        attribute vec3 aSpawn;
        attribute float aDrift;

        varying float vExposure;
        varying vec2 vUv;
        varying float vDrift;

        void main() {
          vUv = uv;
          vDrift = aDrift;

          vec3 origin = uAnchor - vec3(uVolume.x * 0.5, uVolume.y * 0.42, uVolume.z * 0.5);
          float phase = aDrift * 6.28318530718;
          float fallSpeed = uSpeed * (0.62 + 0.76 * aDrift);
          vec3 wander = vec3(
            sin(uTime * 0.72 + phase) + sin(uTime * 1.53 + phase * 1.7) * 0.32,
            0.0,
            cos(uTime * 0.61 + phase) + cos(uTime * 1.27 + phase * 1.3) * 0.32
          ) * uSway * (0.45 + 0.55 * aDrift);
          vec3 local = aSpawn * uVolume + vec3(uWind.x, -fallSpeed, uWind.z) * uTime + wander;
          vec3 worldCenter = mod(local - origin, uVolume) + origin;
          vExposure = weatherExposure(worldCenter);
          float flakeSize = uSize * (0.48 + 1.08 * aDrift);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 world = worldCenter + right * position.x * flakeSize + up * position.y * flakeSize;

          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
        fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;

        varying float vExposure;
        varying vec2 vUv;
        varying float vDrift;

        void main() {
          float distanceFromCenter = length(vUv - 0.5) * 2.0;
          float disc = smoothstep(1.0, 0.12, distanceFromCenter);
          float core = smoothstep(0.54, 0.0, distanceFromCenter) * 0.42;
          float alpha = (disc + core) * uOpacity * (0.56 + 0.44 * vDrift);
          alpha *= vExposure;
          if (alpha < 0.001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = props.frustumCulled ?? !(props.followCamera ?? true);
      mesh.renderOrder = props.renderOrder ?? 11;
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
      const uniforms = material.uniforms;
      const followCamera = props.followCamera ?? true;
      const origin = props.origin ?? DEFAULT_ORIGIN;
      const target = uniforms.uAnchor.value as THREE.Vector3;
      if (followCamera) target.copy(state.camera.position);
      else target.set(origin[0], origin[1], origin[2]);
      const volume = props.volume ?? DEFAULT_VOLUME;
      uniforms.uVolume.value.set(volume[0], volume[1], volume[2]);
      uniforms.uSpeed.value = props.speed ?? 3.2;
      uniforms.uSize.value = props.size ?? 0.11;
      uniforms.uSway.value = props.sway ?? 0.62;
      uniforms.uOpacity.value = props.opacity ?? 0.86;
      uniforms.uColor.value.set(props.color ?? DEFAULT_SNOW_COLOR);
      geometry.instanceCount = resolveWeatherInstanceCount(
        props.count ?? DEFAULT_SNOW_COUNT,
        (props.density ?? DEFAULT_SNOW_DENSITY) * set.snow.value,
        props.budget,
      );
      const metrics = set.metrics?.snow;
      if (metrics !== undefined) {
        metrics.count = geometry.instanceCount;
        metrics.capacity = geometry.getAttribute("aSpawn").count;
      }
      mesh.frustumCulled = props.frustumCulled ?? !followCamera;
      mesh.renderOrder = props.renderOrder ?? 11;
    },
    dispose(state: EngineFrameState) {
      leaveTicker();
      leaveTicker = () => {};
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

/** GPU-animated drifting snowflakes around the camera, sheltered under authored roofs. */
export function SnowField(props: SnowFieldProps) {
  const uniforms = useWeatherUniformSet({
    wind: props.wind,
    timeScale: props.timeScale,
    timeSeconds: props.timeSeconds,
  });
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(
    () => snowFieldDraw(() => latest.current, uniforms),
    [props.count, props.seed, uniforms],
  );
  return null;
}
