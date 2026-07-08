import { useEffect, useMemo } from "react";
import * as THREE from "three";

export interface SkyDomeProps {
  topColor?: string;
  horizonColor?: string;
  radius?: number;
  offset?: number;
  exponent?: number;
}

const SKY_TOP = "#3fa4f2";
const SKY_HORIZON = "#e3f4ff";
const FOG_COLOR = "#e9f6ff";
const SUN_COLOR = "#fff1c9";
const HEMI_SKY = "#bfe3ff";
const HEMI_GROUND = "#4c6b34";

export function SkyDome({
  topColor = SKY_TOP,
  horizonColor = SKY_HORIZON,
  radius = 260,
  offset = 24,
  exponent = 0.65,
}: SkyDomeProps = {}) {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(topColor) },
        bottomColor: { value: new THREE.Color(horizonColor) },
        offset: { value: offset },
        exponent: { value: exponent },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
  }, [topColor, horizonColor, offset, exponent]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} renderOrder={-1}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}

export interface DaylightProps {
  sky?: SkyDomeProps | false;
  fog?: { color?: string; near?: number; far?: number } | false;
  sun?: { position?: readonly [number, number, number]; intensity?: number; color?: string };
  ambient?: { skyColor?: string; groundColor?: string; intensity?: number };
}

export function Daylight({ sky, fog, sun, ambient }: DaylightProps = {}) {
  const sunPosition = sun?.position ?? [120, 160, 70];
  return (
    <>
      {sky === false ? null : <SkyDome {...(sky ?? {})} />}
      {fog === false ? null : (
        <fog attach="fog" args={[fog?.color ?? FOG_COLOR, fog?.near ?? 70, fog?.far ?? 260]} />
      )}
      <hemisphereLight
        args={[ambient?.skyColor ?? HEMI_SKY, ambient?.groundColor ?? HEMI_GROUND, ambient?.intensity ?? 0.55]}
      />
      <directionalLight
        position={[sunPosition[0], sunPosition[1], sunPosition[2]]}
        intensity={sun?.intensity ?? 0.85}
        color={sun?.color ?? SUN_COLOR}
        castShadow
      />
    </>
  );
}
