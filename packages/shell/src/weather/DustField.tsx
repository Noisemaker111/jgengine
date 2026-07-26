import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useDisposable } from "../render/useDisposable";
import { createWeatherQuadGeometry } from "./weatherGeometry";
import { DEFAULT_DUST_COUNT, DEFAULT_DUST_DENSITY, resolveWeatherInstanceCount } from "./weatherMath";
import { useWeatherUniformSet, type WeatherVector } from "./weatherUniforms";

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
  seed?: number;
  renderOrder?: number;
  frustumCulled?: boolean;
}

const DEFAULT_VOLUME: WeatherVector = [70, 22, 70];
const DEFAULT_ORIGIN: WeatherVector = [0, 0, 0];
const DEFAULT_DUST_COLOR = "#c8a878";

export function DustField({
  count = DEFAULT_DUST_COUNT,
  density = DEFAULT_DUST_DENSITY,
  budget,
  volume = DEFAULT_VOLUME,
  wind,
  origin = DEFAULT_ORIGIN,
  followCamera = true,
  speed = 2.4,
  size = 0.16,
  sway = 0.5,
  opacity = 0.3,
  color = DEFAULT_DUST_COLOR,
  groundBias = 0.65,
  timeScale,
  seed = 51407,
  renderOrder = 10,
  frustumCulled,
}: DustFieldProps) {
  const { camera } = useThree();
  const shared = useWeatherUniformSet({ wind, timeScale });
  const geometry = useDisposable(() => createWeatherQuadGeometry(count, seed), [count, seed]);
  const material = useDisposable(() => {
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
      uGroundBias: { value: groundBias },
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
        uniform float uGroundBias;

        attribute vec3 aSpawn;
        attribute float aDrift;

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

        varying vec2 vUv;
        varying float vDrift;
        varying float vFade;

        void main() {
          float distanceFromCenter = length(vUv - 0.5) * 2.0;
          // No hard core: dust is diffuse, and a bright centre reads as snow.
          float puff = smoothstep(1.0, 0.05, distanceFromCenter);
          float alpha = puff * puff * uOpacity * (0.35 + 0.65 * vDrift) * vFade;
          if (alpha < 0.001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
  }, [color, groundBias, opacity, shared, size, speed, sway]);

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
    uniforms.uGroundBias.value = groundBias;
    (uniforms.uColor.value as THREE.Color).set(color);
    geometry.instanceCount = resolveWeatherInstanceCount(count, density, budget);
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={frustumCulled ?? !followCamera}
      renderOrder={renderOrder}
    />
  );
}
