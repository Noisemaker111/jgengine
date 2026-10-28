import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { VolumetricCloudsRules } from "@jgengine/core/sky/volumetricClouds";
import { cloudNoiseVolume, CLOUD_NOISE_SIZE } from "@jgengine/core/sky/volumetricClouds";

import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { createSkyLight, readSkyLight } from "./skyLight.draw";

/** Props for {@link VolumetricClouds}: fully resolved cloud rules. Light and cover come from the scene's {@link readSkyLight}. */
export interface VolumetricCloudsProps {
  rules: VolumetricCloudsRules;
}

/** The proxy sphere sits at this fraction of the camera far plane, so nearer geometry hides the clouds before their shader runs. */
const FAR_FRACTION = 0.9;

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

let sharedNoise: THREE.Data3DTexture | null = null;

/** One tileable noise volume per page, shared by every cloud layer. */
function cloudNoiseTexture(): THREE.Data3DTexture {
  if (sharedNoise !== null) return sharedNoise;
  const texture = new THREE.Data3DTexture(cloudNoiseVolume(), CLOUD_NOISE_SIZE, CLOUD_NOISE_SIZE, CLOUD_NOISE_SIZE);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  sharedNoise = texture;
  return texture;
}

const CLOUD_VERTEX_SHADER = /* glsl */ `
varying vec3 vJgCloudWorldPos;
void main() {
  vJgCloudWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_FRAGMENT_SHADER = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uNoise;
uniform vec3 uCameraPos;
uniform vec3 uAlbedo;
uniform vec3 uRim;
uniform vec3 uLightDirection;
uniform vec3 uLight;
uniform vec3 uAmbientTop;
uniform vec3 uAmbientBottom;
uniform vec3 uHorizon;
uniform float uSunScatter;
uniform float uCoverage;
uniform float uDensity;
uniform float uBaseHeight;
uniform float uThickness;
uniform float uScale;
uniform float uFade;
uniform vec3 uWind;
uniform float uFrame;
uniform float uSeed;
varying vec3 vJgCloudWorldPos;

float jgCloudShape(vec3 pos, float heightFrac, bool detailed) {
  vec3 q = (pos + uWind) / uScale + uSeed * 17.0;
  // Fields of cloud with clear sky between them, filling in as the cover rises.
  float field = texture(uNoise, vec3(q.xz * 0.045, 0.31)).r;
  float n = texture(uNoise, q * 0.25).r;
  if (detailed) n -= (1.0 - texture(uNoise, q * 1.3 + 0.37).r) * 0.16;
  // Rounded bases, eroded tops: the threshold rises toward both edges of the slab.
  float rounding = (1.0 - smoothstep(0.0, 0.18, heightFrac)) * 0.25 + smoothstep(0.45, 1.0, heightFrac) * 0.35;
  float threshold = mix(0.66, 0.3, clamp(uCoverage + (field - 0.5) * 0.9 * (1.0 - uCoverage), 0.0, 1.0)) + rounding;
  return clamp((n - threshold) * 4.0, 0.0, 1.0);
}

float jgCloudDensity(vec3 pos, bool detailed) {
  float heightFrac = (pos.y - uBaseHeight) / uThickness;
  if (heightFrac < 0.0 || heightFrac > 1.0) return 0.0;
  return jgCloudShape(pos, heightFrac, detailed) * uDensity;
}

// Light reaching a point through the cloud above it toward the sun or moon (Beer's law), so the
// clouds shade themselves: bright crowns, dark undersides.
float jgCloudLightAt(vec3 pos) {
  float stepL = uThickness * 0.3;
  float dens = 0.0;
  vec3 p = pos;
  for (int i = 0; i < 2; i++) {
    p += uLightDirection * stepL;
    dens += jgCloudDensity(p, false);
  }
  return exp(-dens * 1.35);
}

float jgHenyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5) * 0.0796;
}

void main() {
  vec3 rayDir = normalize(vJgCloudWorldPos - uCameraPos);
  float tBottom = (uBaseHeight - uCameraPos.y) / rayDir.y;
  float tTop = (uBaseHeight + uThickness - uCameraPos.y) / rayDir.y;
  if (abs(rayDir.y) < 1e-4) discard;
  float tNear = max(min(tBottom, tTop), 0.0);
  float tFar = max(tBottom, tTop);
  if (tFar <= tNear) discard;
  tFar = min(tFar, tNear + uThickness * 4.0);

  const int STEPS = 14;
  float stepLen = (tFar - tNear) / float(STEPS);
  // Per-pixel jitter turns banding into fine noise that temporal AA settles.
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(0.06711056, 0.00583715))));
  float t = tNear + stepLen * jitter;
  float transmittance = 1.0;
  vec3 color = vec3(0.0);
  float cosTheta = dot(rayDir, uLightDirection);
  float phase = mix(jgHenyeyGreenstein(cosTheta, 0.6), jgHenyeyGreenstein(cosTheta, -0.2), 0.3);
  float tHit = -1.0;

  for (int i = 0; i < STEPS; i++) {
    vec3 pos = uCameraPos + rayDir * t;
    float dens = jgCloudDensity(pos, true);
    if (dens > 0.001) {
      if (tHit < 0.0) tHit = t;
      float heightFrac = clamp((pos.y - uBaseHeight) / uThickness, 0.0, 1.0);
      float lightT = jgCloudLightAt(pos);
      // Multiple scattering, roughly: thick cloud still glows a little inside (the powder term).
      float powder = 1.0 - exp(-dens * 2.0);
      vec3 ambient = mix(uAmbientBottom, uAmbientTop, heightFrac);
      vec3 direct = uLight * lightT * (phase * 12.0 * (1.0 + uSunScatter) * (0.4 + 0.6 * powder) + 0.9);
      vec3 lit = uAlbedo * (ambient + direct) + uRim * uLight * lightT * pow(max(cosTheta, 0.0), 8.0) * uSunScatter * 0.15;
      float a = 1.0 - exp(-dens * stepLen / uThickness * 6.0);
      color += transmittance * a * lit;
      transmittance *= 1.0 - a;
      if (transmittance < 0.03) break;
    }
    t += stepLen;
  }

  if (tHit < 0.0) discard;
  float alpha = 1.0 - transmittance;
  vec3 shaded = color / max(alpha, 1e-4);
  // Distant cloud sinks into the horizon haze, and a cloud seen from far below its slab edge-on thins out.
  float haze = 1.0 - exp(-tHit / uFade);
  shaded = mix(shaded, uHorizon, haze * 0.85);
  alpha *= 1.0 - haze * haze * 0.9;
  alpha *= smoothstep(0.0, 0.03, rayDir.y) + step(uBaseHeight, uCameraPos.y);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(shaded, clamp(alpha, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** The camera's far plane, or infinity for a camera without one. */
function cameraFar(camera: THREE.Camera): number {
  return camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera ? camera.far : Number.POSITIVE_INFINITY;
}

/**
 * A raymarched cloud slab between `height` and `height + thickness`, drawn on a camera-centred sphere
 * just inside the far plane. Each frame it reads the scene's {@link readSkyLight}: the sun (or the moon
 * at night) lights and shadows it, the sky colours its shade, and the weather's cloud cover thickens
 * and darkens it. Mounted by `Sky` when a sky descriptor carries `volumetricClouds`; a game with its own
 * sky can mount it beside that sky as long as the sky publishes its light.
 * @internal
 */
export function VolumetricClouds({ rules }: VolumetricCloudsProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);
  const frameRef = useRef(0);
  const fallback = useRef(createSkyLight());

  const uniforms = useMemo(
    () => ({
      uNoise: { value: cloudNoiseTexture() },
      uCameraPos: { value: new THREE.Vector3() },
      uAlbedo: { value: new THREE.Color(rules.color) },
      uRim: { value: new THREE.Color(rules.sunColor) },
      uLightDirection: { value: new THREE.Vector3(0, 1, 0) },
      uLight: { value: new THREE.Color() },
      uAmbientTop: { value: new THREE.Color() },
      uAmbientBottom: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunScatter: { value: rules.sunScatter },
      uCoverage: { value: rules.coverage },
      uDensity: { value: rules.density },
      uBaseHeight: { value: rules.height },
      uThickness: { value: rules.thickness },
      uScale: { value: rules.scale },
      uFade: { value: rules.fade },
      uWind: { value: new THREE.Vector3() },
      uFrame: { value: 0 },
      uSeed: { value: hashSeed(rules.seed) },
    }),
    [rules],
  );
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: CLOUD_VERTEX_SHADER,
        fragmentShader: CLOUD_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
      }),
    [uniforms],
  );

  const albedo = useRef(new THREE.Color());
  useFrame((state, delta) => {
    timeRef.current += delta;
    frameRef.current = (frameRef.current + 1) % 64;
    const mesh = meshRef.current;
    if (mesh !== null) {
      mesh.position.set(state.camera.position.x, state.camera.position.y, state.camera.position.z);
      const far = cameraFar(state.camera);
      mesh.scale.setScalar(Number.isFinite(far) && far > 0 ? far * FAR_FRACTION : 1000);
    }
    const light = readSkyLight(state.scene) ?? fallback.current;
    const cover = light.cloudCover;
    const u = uniforms;
    u.uCameraPos.value.copy(state.camera.position);
    // The sun lights the clouds by day; once it is well down the moon takes over.
    const sunUp = THREE.MathUtils.smoothstep(light.sunDirection.y, -0.08, 0.02);
    const lightDirection = u.uLightDirection.value;
    if (sunUp > 0) lightDirection.copy(light.sunDirection);
    else lightDirection.copy(light.moonDirection);
    if (lightDirection.y < 0.05) lightDirection.setY(0.05).normalize();
    const lit = u.uLight.value;
    lit.copy(light.moon).lerp(light.sun, sunUp).multiplyScalar(1 - cover * 0.7);
    u.uAmbientTop.value.copy(light.zenith).lerp(light.horizon, 0.4).multiplyScalar(1.1);
    u.uAmbientBottom.value.copy(light.horizon).lerp(light.zenith, 0.3).multiplyScalar(0.55 - cover * 0.15);
    u.uHorizon.value.copy(light.horizon);
    // Rain clouds are thicker, fuller and greyer than fair-weather cumulus.
    albedo.current.set(rules.color).multiplyScalar(1 - cover * 0.45);
    u.uAlbedo.value.copy(albedo.current);
    u.uCoverage.value = rules.coverage + (1 - rules.coverage) * cover * 0.85;
    u.uDensity.value = rules.density * (1 + cover * 1.5);
    u.uWind.value.set(timeRef.current * rules.speed, timeRef.current * rules.speed * 0.15, timeRef.current * rules.speed * 0.6);
    u.uFrame.value = frameRef.current;
  });

  return (
    <mesh ref={meshRef} material={material} renderOrder={-0.5} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  );
}
