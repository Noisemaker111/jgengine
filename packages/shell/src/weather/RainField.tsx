import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { createWeatherQuadGeometry } from "./weatherGeometry";
import { resolveWeatherInstanceCount } from "./weatherMath";
import { useWeatherUniformSet, type WeatherVector } from "./weatherUniforms";

export interface RainFieldProps {
  count?: number;
  density?: number;
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
  seed?: number;
  renderOrder?: number;
}

const DEFAULT_VOLUME: WeatherVector = [56, 42, 56];
const DEFAULT_ORIGIN: WeatherVector = [0, 0, 0];
const DEFAULT_RAIN_COLOR = "#b8c4d8";

export function RainField({
  count = 8000,
  density = 0.45,
  volume = DEFAULT_VOLUME,
  wind,
  origin = DEFAULT_ORIGIN,
  followCamera = true,
  speed = 22,
  length = 1.35,
  width = 0.018,
  opacity = 0.48,
  color = DEFAULT_RAIN_COLOR,
  lightning,
  timeScale,
  seed = 11939,
  renderOrder = 10,
}: RainFieldProps) {
  const { camera } = useThree();
  const shared = useWeatherUniformSet({ wind, lightning, timeScale });
  const geometry = useMemo(() => createWeatherQuadGeometry(count, seed), [count, seed]);
  const material = useMemo(() => {
    const uniforms = {
      uTime: shared.time,
      uWind: shared.wind,
      uLightning: shared.lightning,
      uAnchor: { value: new THREE.Vector3() },
      uVolume: { value: new THREE.Vector3() },
      uSpeed: { value: speed },
      uLength: { value: length },
      uWidth: { value: width },
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
        uniform float uLength;
        uniform float uWidth;

        attribute vec3 aSpawn;
        attribute float aDrift;

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

        varying vec2 vUv;
        varying float vDrift;

        void main() {
          float across = smoothstep(0.0, 0.45, vUv.x) * smoothstep(1.0, 0.55, vUv.x);
          float along = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.58, vUv.y);
          float alpha = across * along * uOpacity * (0.55 + 0.45 * vDrift);
          if (alpha < 0.001) discard;
          vec3 litColor = uColor * (1.0 + uLightning * 2.25);
          gl_FragColor = vec4(litColor, alpha);
        }
      `,
    });
  }, [color, length, opacity, shared, speed, width]);

  useFrame(() => {
    const anchor = followCamera ? camera.position : null;
    const uniforms = material.uniforms;
    const target = uniforms.uAnchor.value as THREE.Vector3;
    if (anchor !== null) target.copy(anchor);
    else target.set(origin[0], origin[1], origin[2]);
    (uniforms.uVolume.value as THREE.Vector3).set(volume[0], volume[1], volume[2]);
    uniforms.uSpeed.value = speed;
    uniforms.uLength.value = length;
    uniforms.uWidth.value = width;
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
