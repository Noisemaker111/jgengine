import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useDisposable } from "../render/useDisposable";
import { createWeatherQuadGeometry } from "./weatherGeometry";
import { useWeatherUniformSet } from "./weatherUniforms";

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

/** Bounded ground ripples sharing precipitation intensity and authoritative animation time.
 * @capability rain-ground-ripples Render bounded rain impacts on exposed terrain using the shared precipitation clock.
 */
export function RainImpactField({ count = 64, extent = 48, heightAt, exposureAt, seed = 11939, color = "#b8c4d8" }: RainImpactFieldProps) {
  const capacity = Math.max(0, Math.min(256, Math.floor(Number.isFinite(count) ? count : 64)));
  const size = Math.max(1, Number.isFinite(extent) ? extent : 48);
  const shared = useWeatherUniformSet();
  const geometry = useDisposable(() => {
    const value = createWeatherQuadGeometry(capacity, seed);
    value.setAttribute("aGround", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    value.setAttribute("aExposure", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    value.instanceCount = capacity;
    return value;
  }, [capacity, seed]);
  const material = useDisposable(() => new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { uTime: shared.time, uRain: shared.rain, uAnchor: { value: new THREE.Vector2() }, uExtent: { value: size }, uColor: { value: new THREE.Color(color) } },
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
  }), [shared, size, color]);

  useFrame((state) => {
    const anchorX = Math.round(state.camera.position.x / 8) * 8;
    const anchorZ = Math.round(state.camera.position.z / 8) * 8;
    (material.uniforms.uAnchor.value as THREE.Vector2).set(anchorX, anchorZ);
    const spawn = geometry.getAttribute("aSpawn");
    const ground = geometry.getAttribute("aGround");
    const exposure = geometry.getAttribute("aExposure");
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
    const metrics = shared.metrics?.impacts;
    if (metrics !== undefined) {
      metrics.count = geometry.instanceCount;
      metrics.capacity = geometry.getAttribute("aSpawn").count;
      metrics.heightQueries = capacity;
      metrics.exposureQueries = exposureAt === undefined ? 0 : capacity;
      metrics.queryBudget = capacity * (exposureAt === undefined ? 1 : 2);
    }
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={9} />;
}
