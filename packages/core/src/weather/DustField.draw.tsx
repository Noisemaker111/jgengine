import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { UniformMaterial } from "@jgengine/core/render/uniformMaterial.draw";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { createWeatherQuadGeometry } from "./weatherGeometry.draw";
import { DEFAULT_DUST_COUNT, DEFAULT_DUST_DENSITY, resolveWeatherInstanceCount } from "./weatherMath";
import { WEATHER_SHELTER_SHADER } from "./weatherShelter.draw";
import {
  createWeatherUniformSet,
  updateWeatherUniformSet,
  useWeatherUniformSet,
  type WeatherUniformOptions,
  type WeatherUniformSet,
  type WeatherVector,
} from "./weatherUniforms.draw";

/**
 * Wind-borne particulate: dust, sand, ash, pollen, spores. Unlike rain and snow this is not falling
 * — motion is dominated by horizontal wind with a slow vertical bob, and density thins with height
 * so the air near the ground carries the most grit. Any arid, volcanic, or blown-out world needs it.
 */
export interface DustFieldProps {
  count?: number;
  density?: number;
  budget?: number;
  volume?: WeatherVector;
  wind?: WeatherVector;
  origin?: WeatherVector;
  followCamera?: boolean;
  /** Horizontal drift added to `wind`, in world units per second. */
  speed?: number;
  size?: number;
  /** Amplitude of the slow vertical bob that keeps motes from travelling on rails. */
  sway?: number;
  opacity?: number;
  color?: THREE.ColorRepresentation;
  /**
   * How fast density falls off with height across the volume, 0..1. At 0 the volume is filled
   * evenly; at 1 nearly everything hugs the ground. Default 0.65.
   */
  groundBias?: number;
  timeScale?: number;
  timeSeconds?: number | (() => number);
  seed?: number;
  renderOrder?: number;
  frustumCulled?: boolean;
}

const DEFAULT_VOLUME: WeatherVector = [70, 22, 70];
const DEFAULT_ORIGIN: WeatherVector = [0, 0, 0];
const DEFAULT_DUST_COLOR = "#c8a878";

function uniformOptions(props: DustFieldProps): WeatherUniformOptions {
  return { wind: props.wind, timeScale: props.timeScale, timeSeconds: props.timeSeconds };
}

type DustMaterialUniforms = {
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
  uGroundBias: { value: number };
};

/**
 * Renders wind-borne particulate as camera-facing motes. Reach for it whenever the air itself
 * should read as weather — a desert gale, ash off a volcano, pollen in a meadow, grain dust in a
 * silo. Compose it through {@link WeatherLayer}'s `"dust"` mode (or `dustAlways` alongside rain and
 * snow) rather than mounting it directly, so it shares one wind and time source with the other layers.
 * `uniforms` is the resolved shared set (the React path's `useWeatherUniformSet`, already ticked);
 * without it the draw owns a local set and ticks it on the board at weather priority.
 *
 * @capability weather-dust airborne particulate that turns still air into visible wind
 */
export function dustFieldDraw(getProps: () => DustFieldProps, uniforms?: WeatherUniformSet): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.InstancedBufferGeometry | null = null;
  let material: UniformMaterial<DustMaterialUniforms> | null = null;
  let shared: WeatherUniformSet | null = null;
  let leaveTicker = () => {};

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      const count = props.count ?? DEFAULT_DUST_COUNT;
      const seed = props.seed ?? 51407;
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
          uSpeed: { value: props.speed ?? 2.4 },
          uSize: { value: props.size ?? 0.16 },
          uSway: { value: props.sway ?? 0.5 },
          uOpacity: { value: props.opacity ?? 0.3 },
          uColor: { value: new THREE.Color(props.color ?? DEFAULT_DUST_COLOR) },
          uGroundBias: { value: props.groundBias ?? 0.65 },
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
        uniform float uGroundBias;

        attribute vec3 aSpawn;
        attribute float aDrift;

        varying float vExposure;
        varying vec2 vUv;
        varying float vDrift;
        varying float vFade;

        void main() {
          vUv = uv;
          vDrift = aDrift;

          // Bias the spawn height toward the ground: pow() on a uniform [0,1) packs samples low
          // without needing a second attribute or a reseed.
          vec3 spawn = aSpawn;
          spawn.y = pow(spawn.y, 1.0 + uGroundBias * 4.0);

          vec3 origin = uAnchor - vec3(uVolume.x * 0.5, uVolume.y * 0.12, uVolume.z * 0.5);
          float phase = aDrift * 6.28318530718;
          // Faster motes ride higher in the gust, the way real airborne grit sorts itself.
          float carry = uSpeed * (0.55 + 0.9 * aDrift);
          vec3 bob = vec3(
            sin(uTime * 0.43 + phase) * 0.35,
            sin(uTime * 0.67 + phase * 1.9) + sin(uTime * 0.31 + phase) * 0.4,
            cos(uTime * 0.39 + phase * 1.3) * 0.35
          ) * uSway * (0.4 + 0.6 * aDrift);
          vec3 travel = normalize(vec3(uWind.x, 0.0, uWind.z) + vec3(0.0001, 0.0, 0.0)) * carry;
          vec3 local = spawn * uVolume + (uWind + travel) * uTime + bob;
          vec3 worldCenter = mod(local - origin, uVolume) + origin;
          vExposure = weatherExposure(worldCenter);

          // Fade at the top of the volume so recycled motes do not pop into view against the sky.
          float height = (worldCenter.y - origin.y) / max(uVolume.y, 0.001);
          vFade = 1.0 - smoothstep(0.55, 1.0, height);

          float moteSize = uSize * (0.4 + 1.3 * aDrift);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 world = worldCenter + right * position.x * moteSize + up * position.y * moteSize;

          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
        fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;

        varying float vExposure;
        varying vec2 vUv;
        varying float vDrift;
        varying float vFade;

        void main() {
          float distanceFromCenter = length(vUv - 0.5) * 2.0;
          // No hard core: dust is diffuse, and a bright centre reads as snow.
          float puff = smoothstep(1.0, 0.05, distanceFromCenter);
          float alpha = puff * puff * uOpacity * (0.35 + 0.65 * vDrift) * vFade;
          alpha *= vExposure;
          if (alpha < 0.001) discard;
          gl_FragColor = vec4(uColor, alpha);
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
      const uniforms = material.uniforms;
      const followCamera = props.followCamera ?? true;
      const origin = props.origin ?? DEFAULT_ORIGIN;
      const target = uniforms.uAnchor.value as THREE.Vector3;
      if (followCamera) target.copy(state.camera.position);
      else target.set(origin[0], origin[1], origin[2]);
      const volume = props.volume ?? DEFAULT_VOLUME;
      uniforms.uVolume.value.set(volume[0], volume[1], volume[2]);
      uniforms.uSpeed.value = props.speed ?? 2.4;
      uniforms.uSize.value = props.size ?? 0.16;
      uniforms.uSway.value = props.sway ?? 0.5;
      uniforms.uOpacity.value = props.opacity ?? 0.3;
      uniforms.uGroundBias.value = props.groundBias ?? 0.65;
      uniforms.uColor.value.set(props.color ?? DEFAULT_DUST_COLOR);
      geometry.instanceCount = resolveWeatherInstanceCount(
        props.count ?? DEFAULT_DUST_COUNT,
        (props.density ?? DEFAULT_DUST_DENSITY) * set.dust.value,
        props.budget,
      );
      const metrics = set.metrics?.dust;
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

export function DustField(props: DustFieldProps) {
  const uniforms = useWeatherUniformSet({
    wind: props.wind,
    timeScale: props.timeScale,
    timeSeconds: props.timeSeconds,
  });
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(
    () => dustFieldDraw(() => latest.current, uniforms),
    [props.count, props.seed, uniforms],
  );
  return null;
}
