import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { VolumetricCloudsRules } from "@jgengine/core/world/volumetricClouds";

/** Props for {@link VolumetricClouds} — fully-resolved cloud rules plus the shared sun direction. */
export interface VolumetricCloudsProps {
  rules: VolumetricCloudsRules;
  /** Direction toward the sun (same vector `SkyDome`/`Daylight` use for the sun disc). */
  sunDirection: readonly [number, number, number];
}

/**
 * Camera-centered proxy dome radius. Must sit inside the default camera far plane
 * (`CAMERA_FRUSTUM_DEFAULTS.far` = 300) — a bigger sphere is clipped whole and renders nothing. The
 * raymarch works in world space against the absolute cloud slab, so this size only has to cover the
 * screen (camera is always at the dome center), never bound the clouds.
 */
const INSIDE_FRUSTUM_DOME_RADIUS = 240;

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

function normalizeVec3(v: readonly [number, number, number]): THREE.Vector3 {
  const out = new THREE.Vector3(v[0], v[1], v[2]);
  return out.lengthSq() === 0 ? new THREE.Vector3(0, 1, 0) : out.normalize();
}

const CLOUD_VERTEX_SHADER = /* glsl */ `
varying vec3 vJgCloudWorldPos;
void main() {
  vJgCloudWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uCameraPos;
uniform vec3 uColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uSunScatter;
uniform float uCoverage;
uniform float uDensity;
uniform float uBaseHeight;
uniform float uThickness;
uniform float uScale;
uniform float uSpeed;
uniform float uTime;
uniform float uSeedOffset;
varying vec3 vJgCloudWorldPos;

float jgCloudHash13(vec3 p){
  p = fract(p * 0.1031 + uSeedOffset * 0.0007);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float jgCloudNoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = jgCloudHash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = jgCloudHash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = jgCloudHash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = jgCloudHash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = jgCloudHash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = jgCloudHash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = jgCloudHash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = jgCloudHash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float jgCloudFbm(vec3 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * jgCloudNoise(p);
    p = p * 2.03 + vec3(11.3, 7.1, 5.7);
    a *= 0.5;
  }
  return v;
}

// Density of the cloud slab at a world point: a 3D-FBM puff field carved by a coverage threshold and
// shaped by a cumulus vertical profile (rounded base, eroded anvil top). 0 outside the slab.
float jgCloudDensity(vec3 pos){
  float heightFrac = (pos.y - uBaseHeight) / uThickness;
  if (heightFrac < 0.0 || heightFrac > 1.0) return 0.0;
  float profile = smoothstep(0.0, 0.2, heightFrac) * smoothstep(1.0, 0.5, heightFrac);
  vec3 wind = vec3(uTime * uSpeed, 0.0, uTime * uSpeed * 0.6);
  vec3 sp = (pos + wind) / uScale;
  float shape = jgCloudFbm(sp);
  float threshold = mix(0.62, 0.2, uCoverage);
  float d = smoothstep(threshold, threshold + 0.3, shape * profile + profile * 0.12);
  return d * profile * uDensity;
}

// March a few steps toward the sun and turn the accumulated density into transmittance (Beer's law) —
// the self-shadowing that gives the clouds volume instead of a flat wash.
float jgCloudLight(vec3 pos){
  vec3 ldir = normalize(uSunDirection);
  float stepL = uThickness * 0.2;
  float dens = 0.0;
  vec3 p = pos;
  for (int i = 0; i < 4; i++) {
    p += ldir * stepL;
    dens += jgCloudDensity(p);
  }
  return exp(-dens * stepL * 1.6);
}

void main() {
  vec3 rayOrigin = uCameraPos;
  vec3 rayDir = normalize(vJgCloudWorldPos - uCameraPos);
  if (rayDir.y < 0.015) discard;

  float tBottom = (uBaseHeight - rayOrigin.y) / rayDir.y;
  float tTop = (uBaseHeight + uThickness - rayOrigin.y) / rayDir.y;
  float tNear = max(min(tBottom, tTop), 0.0);
  float tFar = max(tBottom, tTop);
  if (tFar <= tNear) discard;
  tFar = min(tFar, tNear + uThickness * 6.0);

  const int STEPS = 32;
  float stepLen = (tFar - tNear) / float(STEPS);
  float t = tNear + stepLen * 0.5;
  float transmittance = 1.0;
  vec3 color = vec3(0.0);
  float sunDot = max(dot(rayDir, normalize(uSunDirection)), 0.0);
  float silver = pow(sunDot, 5.0) * uSunScatter;

  for (int i = 0; i < STEPS; i++) {
    vec3 pos = rayOrigin + rayDir * t;
    float dens = jgCloudDensity(pos);
    if (dens > 0.002) {
      float light = jgCloudLight(pos);
      float powder = 1.0 - exp(-dens * 3.0);
      vec3 lit = mix(uColor, uSunColor, light) * (0.55 + 0.45 * powder) + uSunColor * silver * 0.5;
      float dt = dens * stepLen * 1.3;
      float a = 1.0 - exp(-dt);
      color += transmittance * a * lit;
      transmittance *= 1.0 - a;
      if (transmittance < 0.02) break;
    }
    t += stepLen;
  }

  float alpha = (1.0 - transmittance) * smoothstep(0.015, 0.22, rayDir.y);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * A raymarched volumetric cloud slab: a large horizontal box straddling `[height, height+thickness]`,
 * following the camera in XZ (like `SkyDome`), whose fragment shader raymarches 3D FBM noise inside
 * the slab and accumulates density-weighted color with a sun-facing forward-scatter term. Mounted
 * from `Daylight`/`SkyDaylight`/`TimeOfDayDaylight` whenever a sky descriptor carries
 * `volumetricClouds`; off by default (the component itself is simply not rendered). A game never
 * mounts this directly — author clouds via `sky({ volumetricClouds })`.
 * @internal
 */
export function VolumetricClouds({ rules, sunDirection }: VolumetricCloudsProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uCameraPos: { value: new THREE.Vector3() },
        uColor: { value: new THREE.Color(rules.color) },
        uSunColor: { value: new THREE.Color(rules.sunColor) },
        uSunDirection: { value: normalizeVec3(sunDirection) },
        uSunScatter: { value: rules.sunScatter },
        uCoverage: { value: rules.coverage },
        uDensity: { value: rules.density },
        uBaseHeight: { value: rules.height },
        uThickness: { value: rules.thickness },
        uScale: { value: rules.scale },
        uSpeed: { value: rules.speed },
        uTime: { value: 0 },
        uSeedOffset: { value: hashSeed(rules.seed) },
      },
      vertexShader: CLOUD_VERTEX_SHADER,
      fragmentShader: CLOUD_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
    });
  }, [rules, sunDirection]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, delta) => {
    timeRef.current += delta;
    const mesh = meshRef.current;
    if (mesh !== null) {
      mesh.position.x = state.camera.position.x;
      mesh.position.z = state.camera.position.z;
    }
    const uniforms = material.uniforms;
    (uniforms.uCameraPos!.value as THREE.Vector3).copy(state.camera.position);
    uniforms.uTime!.value = timeRef.current;
  });

  return (
    <mesh ref={meshRef} material={material} renderOrder={-0.5} frustumCulled={false}>
      <sphereGeometry args={[INSIDE_FRUSTUM_DOME_RADIUS, 32, 16]} />
    </mesh>
  );
}
