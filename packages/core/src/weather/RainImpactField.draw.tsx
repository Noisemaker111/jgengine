import { useRef } from "react";
import * as THREE from "three";
import { UniformMaterial } from "@jgengine/core/render/uniformMaterial.draw";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { createWeatherQuadGeometry } from "./weatherGeometry.draw";
import {
  createWeatherUniformSet,
  updateWeatherUniformSet,
  useWeatherUniformSet,
  type WeatherUniformOptions,
  type WeatherUniformSet,
} from "./weatherUniforms.draw";

/** Bounded ripple pool with terrain height and sky exposure query adapters. */
export interface RainImpactFieldProps {
  /** Fixed splash pool, clamped to 256. Default 64. */
  count?: number;
  extent?: number;
  heightAt: (x: number, z: number) => number;
  /** Sky exposure 0..1; sheltered surfaces produce no splashes. */
  exposureAt?: (x: number, y: number, z: number) => number;
  seed?: number;
  color?: THREE.ColorRepresentation;
}

const NO_UNIFORM_OPTIONS: WeatherUniformOptions = {};

/**
 * Bounded ground ripples sharing precipitation intensity and authoritative animation time.
 * `uniforms` is the resolved shared set (the React path's `useWeatherUniformSet`, already
 * ticked); without it the draw owns a local set and ticks it on the board at weather priority.
 * @capability rain-ground-ripples Render bounded rain impacts on exposed terrain using the shared precipitation clock.
 */
export function rainImpactFieldDraw(getProps: () => RainImpactFieldProps, uniforms?: WeatherUniformSet): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.InstancedBufferGeometry | null = null;
  let material: UniformMaterial | null = null;
  let shared: WeatherUniformSet | null = null;
  let capacity = 0;
  let size = 48;
  let leaveTicker = () => {};

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      capacity = Math.max(0, Math.min(256, Math.floor(Number.isFinite(props.count ?? 64) ? (props.count ?? 64) : 64)));
      size = Math.max(1, Number.isFinite(props.extent ?? 48) ? (props.extent ?? 48) : 48);
      shared = uniforms ?? createWeatherUniformSet(NO_UNIFORM_OPTIONS);
      const set = shared;
      geometry = createWeatherQuadGeometry(capacity, props.seed ?? 11939);
      geometry.setAttribute("aGround", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
      geometry.setAttribute("aExposure", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
      geometry.instanceCount = capacity;
      material = new UniformMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        uniforms: {
          uTime: set.time,
          uRain: set.rain,
          uAnchor: { value: new THREE.Vector2() },
          uExtent: { value: size },
          uColor: { value: new THREE.Color(props.color ?? "#b8c4d8") },
        },
        vertexShader: `
      uniform float uTime;
      uniform float uExtent;
      uniform vec2 uAnchor;
      attribute vec3 aSpawn;
      attribute float aDrift;
      attribute float aGround;
      attribute float aExposure;
      varying vec2 vUv;
      varying float vPhase;
      varying float vExposure;
      void main() {
        vUv = uv;
        vPhase = fract(uTime * (1.6 + aDrift * 0.8) + aDrift);
        vExposure = aExposure;
        float radius = 0.08 + vPhase * 0.45;
        vec2 center = uAnchor + (aSpawn.xz - 0.5) * uExtent;
        vec3 world = vec3(center.x + position.x * radius, aGround + 0.015, center.y + position.y * radius);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
        fragmentShader: `
      uniform float uRain;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vPhase;
      varying float vExposure;
      void main() {
        float radius = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.65, 0.8, radius) * (1.0 - smoothstep(0.84, 1.0, radius));
        float alpha = ring * (1.0 - vPhase) * min(1.0, uRain) * vExposure * 0.45;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      state.scene.add(mesh);
      if (uniforms === undefined) {
        leaveTicker = joinFrameTask(-1, (frameState, delta) => {
          const position = frameState.camera.position;
          updateWeatherUniformSet(set, NO_UNIFORM_OPTIONS, delta, position.x, position.z, position.y);
        });
      }
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      const set = shared;
      if (set === null || mesh === null || material === null || geometry === null) return;
      const anchorX = Math.round(state.camera.position.x / 8) * 8;
      const anchorZ = Math.round(state.camera.position.z / 8) * 8;
      (material.uniforms.uAnchor.value as THREE.Vector2).set(anchorX, anchorZ);
      material.uniforms.uExtent.value = size;
      material.uniforms.uColor.value.set(props.color ?? "#b8c4d8");
      const spawn = geometry.getAttribute("aSpawn");
      const ground = geometry.getAttribute("aGround");
      const exposure = geometry.getAttribute("aExposure");
      const heightAt = props.heightAt;
      const exposureAt = props.exposureAt;
      for (let i = 0; i < capacity; i += 1) {
        const x = anchorX + (spawn.getX(i) - 0.5) * size;
        const z = anchorZ + (spawn.getZ(i) - 0.5) * size;
        const y = heightAt(x, z);
        ground.setX(i, Number.isFinite(y) ? y : 0);
        const open = exposureAt?.(x, y, z) ?? 1;
        exposure.setX(i, Math.max(0, Math.min(1, Number.isFinite(open) ? open : 0)));
      }
      ground.needsUpdate = true;
      exposure.needsUpdate = true;
      const metrics = set.metrics?.impacts;
      if (metrics !== undefined) {
        metrics.count = geometry.instanceCount;
        metrics.capacity = geometry.getAttribute("aSpawn").count;
        metrics.heightQueries = capacity;
        metrics.exposureQueries = exposureAt === undefined ? 0 : capacity;
        metrics.queryBudget = capacity * (exposureAt === undefined ? 1 : 2);
      }
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

export function RainImpactField(props: RainImpactFieldProps) {
  const uniforms = useWeatherUniformSet();
  const latest = useRef(props);
  latest.current = props;
  const capacity = Math.max(0, Math.min(256, Math.floor(Number.isFinite(props.count ?? 64) ? (props.count ?? 64) : 64)));
  const size = Math.max(1, Number.isFinite(props.extent ?? 48) ? (props.extent ?? 48) : 48);
  useEngineDraw(
    () => rainImpactFieldDraw(() => latest.current, uniforms),
    [capacity, props.seed, size, uniforms],
  );
  return null;
}
