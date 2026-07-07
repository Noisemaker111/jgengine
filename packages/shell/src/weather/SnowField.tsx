import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { createWeatherQuadGeometry } from "./weatherGeometry";
import { resolveWeatherInstanceCount } from "./weatherMath";
import { useWeatherUniformSet, type WeatherVector } from "./weatherUniforms";

export interface SnowFieldProps {
  count?: number;
  density?: number;
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
  seed?: number;
  renderOrder?: number;
}

const DEFAULT_VOLUME: WeatherVector = [52, 38, 52];
const DEFAULT_ORIGIN: WeatherVector = [0, 0, 0];
const DEFAULT_SNOW_COLOR = "#ffffff";

export function SnowField({
  count = 6000,
  density = 0.5,
  volume = DEFAULT_VOLUME,
  wind,
  origin = DEFAULT_ORIGIN,
  followCamera = true,
  speed = 3.2,
  size = 0.11,
  sway = 0.62,
  opacity = 0.86,
  color = DEFAULT_SNOW_COLOR,
  timeScale,
  seed = 72931,
  renderOrder = 11,
}: SnowFieldProps) {
  const { camera } = useThree();
  const shared = useWeatherUniformSet({ wind, timeScale });
  const geometry = useMemo(() => createWeatherQuadGeometry(count, seed), [count, seed]);
  const material = useMemo(() => {
    const uniforms = {
      uTime: shared.time,
      uWind: shared.wind,
      uAnchor: { value: new THREE.Vector3() },
      uVolume: { value: new THREE.Vector3() },
      uSpeed: { value: speed },
      uSize: { value: size },
      uSway: { value: sway },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
    } satisfies Record<string, THREE.IUniform>;

    return new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: `
        uniform float uTime;
        uniform vec3 uWind;
        uniform vec3 uAnchor;
        uniform vec3 uVolume;
        uniform float uSpeed;
        uniform float uSize;
        uniform float uSway;

        attribute vec3 aSpawn;
        attribute float aDrift;

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

        varying vec2 vUv;
        varying float vDrift;

        void main() {
          float distanceFromCenter = length(vUv - 0.5) * 2.0;
          float disc = smoothstep(1.0, 0.12, distanceFromCenter);
          float core = smoothstep(0.54, 0.0, distanceFromCenter) * 0.42;
          float alpha = (disc + core) * uOpacity * (0.56 + 0.44 * vDrift);
          if (alpha < 0.001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
  }, [color, opacity, shared, size, speed, sway]);

  useFrame(() => {
    const anchor = followCamera ? camera.position : null;
    const uniforms = material.uniforms;
    const target = uniforms.uAnchor.value as THREE.Vector3;
    if (anchor !== null) target.copy(anchor);
    else target.set(origin[0], origin[1], origin[2]);
    (uniforms.uVolume.value as THREE.Vector3).set(volume[0], volume[1], volume[2]);
    uniforms.uSpeed.value = speed;
    uniforms.uSize.value = size;
    uniforms.uSway.value = sway;
    uniforms.uOpacity.value = opacity;
    (uniforms.uColor.value as THREE.Color).set(color);
    geometry.instanceCount = resolveWeatherInstanceCount(count, density);
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={renderOrder} />;
}
