import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { resolveAmbientLife, type AmbientLifeConfig, type ResolvedAmbientLife, type SteamVent } from "@jgengine/core/render/ambientLife";

import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { findKeyLight, towardLight } from "@jgengine/core/postfx/contactShadowPass.draw";
import { advanceLivingWorld, livingWorld, resetLivingWorld } from "./livingWorld";
import { windDirection, windGust } from "@jgengine/core/model/modelWind.draw";
import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { prepareBeforeWarmup } from "@jgengine/core/render/shaderWarmup.draw";
import { applyWetnessToScene } from "@jgengine/core/material/wetSurfaces.draw";

const LIGHT_RESCAN_SECONDS = 1.5;
const WET_SCAN_SECONDS = 2;
const sunDirection = new THREE.Vector3();

/** How hard plants bend for a ground wind of `speed` world units per second. @internal */
export function gustForWind(speed: number): number {
  return Math.min(2.5, 1 + speed / 10);
}

/**
 * Birds want fair daylight: full in sun, gone in rain and from dusk on. 0..1. @internal
 */
export function birdPresence(sunHeight: number | null, rain: number): number {
  if (sunHeight === null) return 0;
  const day = Math.min(1, Math.max(0, (sunHeight - 0.04) / 0.12));
  return day * Math.max(0, 1 - rain * 2.5);
}

/** How thick steam hangs: thin on a warm dry day, dense in rain and at night. 0..1. @internal */
export function steamDensity(sunHeight: number | null, rain: number): number {
  const cold = sunHeight === null ? 0.6 : Math.min(1, Math.max(0, 0.5 - sunHeight * 1.2));
  return Math.min(1, 0.35 + cold * 0.4 + rain * 0.5);
}

function LivingWorldDriver() {
  const scene = useThree((state) => state.scene);
  const light = useRef<THREE.DirectionalLight | null>(null);
  const sinceScan = useRef(LIGHT_RESCAN_SECONDS);
  const sinceWet = useRef(WET_SCAN_SECONDS);
  useEffect(() => () => {
    resetLivingWorld();
    windGust.value = 1;
  }, []);
  // Ground that loads while it is already wet is patched before the warmup links it, so it is
  // compiled once as wet ground instead of once dry and again a scan later.
  useEffect(
    () =>
      prepareBeforeWarmup(scene, () => {
        if (livingWorld.wetness > 0) applyWetnessToScene(scene);
      }),
    [scene],
  );
  useFrame((_, delta) => {
    sinceScan.current += delta;
    if (sinceScan.current >= LIGHT_RESCAN_SECONDS || light.current?.parent === null) {
      light.current = findKeyLight(scene);
      sinceScan.current = 0;
    }
    const sunHeight = light.current === null ? null : towardLight(light.current, sunDirection).y;
    advanceLivingWorld(delta, sunHeight);
    const wind = livingWorld.wind;
    const speed = wind.length();
    if (speed > 0.05) windDirection.copy(wind).divideScalar(speed);
    windGust.value = gustForWind(speed);
    sinceWet.current += delta;
    if (livingWorld.wetness > 0 && sinceWet.current >= WET_SCAN_SECONDS) {
      applyWetnessToScene(scene);
      sinceWet.current = 0;
    }
  }, -1);
  return null;
}

const BIRD_VERTEX = /* glsl */ `
  attribute float aTip;
  uniform float uTime;
  varying float vLight;
  void main() {
    float id = float(gl_InstanceID);
    vec3 p = position;
    p.y += sin(uTime * (7.0 + mod(id, 3.0)) + id * 1.7) * aTip * 0.45;
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    // A bird right at the lens reads as a shard, so it folds away before it gets there.
    world.xyz = mix(centre, world.xyz, smoothstep(14.0, 26.0, distance(centre, cameraPosition)));
    // Seen from above, a gull's back is pale and sunlit; from below it is a dark silhouette.
    vLight = smoothstep(-2.0, 6.0, cameraPosition.y - centre.y);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const BIRD_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vLight;
  void main() { gl_FragColor = vec4(mix(vec3(0.08, 0.09, 0.11), vec3(0.86, 0.87, 0.85), vLight), uOpacity); }
`;

function birdGeometry(): THREE.BufferGeometry {
  // A gull in silhouette: an inner wing raised to the elbow, an outer wing swept back and down.
  const front = [0, 0, 0.28];
  const tail = [0, 0, -0.42];
  const positions: number[] = [];
  const tips: number[] = [];
  for (const side of [-1, 1]) {
    const elbow = [0.46 * side, 0.14, 0.04];
    const elbowBack = [0.4 * side, 0.12, -0.16];
    const tip = [1.0 * side, -0.05, -0.32];
    positions.push(...front, ...tail, ...elbowBack, ...front, ...elbowBack, ...elbow, ...elbow, ...elbowBack, ...tip);
    tips.push(0, 0, 0.45, 0, 0.45, 0.45, 0.45, 0.45, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aTip", new THREE.Float32BufferAttribute(tips, 1));
  return geometry;
}

const birdPosition = new THREE.Vector3();
const birdQuaternion = new THREE.Quaternion();
const birdScale = new THREE.Vector3();
const birdEuler = new THREE.Euler();
const focus = new THREE.Vector3();
const forward = new THREE.Vector3();

/** Where the camera looks on the ground plane, or a point ahead of it when it looks at the sky. @internal */
export function flockFocus(camera: THREE.Camera, target: THREE.Vector3): THREE.Vector3 {
  camera.getWorldPosition(target);
  camera.getWorldDirection(forward);
  const reach = forward.y < -0.05 ? Math.min(150, target.y / -forward.y) : 40;
  target.addScaledVector(forward, reach);
  target.y = 0;
  return target;
}

function Birds({ flock }: { flock: NonNullable<ResolvedAmbientLife["birds"]> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useDisposable(birdGeometry, []);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
        vertexShader: BIRD_VERTEX,
        fragmentShader: BIRD_FRAGMENT,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  const centre = useRef<THREE.Vector3 | null>(null);
  const presence = useRef<number | null>(null);
  useFrame(({ camera, clock }, delta) => {
    const target = birdPresence(livingWorld.sunHeight, livingWorld.rain);
    presence.current = presence.current === null ? target : presence.current + (target - presence.current) * Math.min(1, delta * 0.4);
    const instanced = mesh.current;
    if (instanced === null) return;
    instanced.visible = presence.current > 0.02;
    if (!instanced.visible) return;
    // The flock circles over the ground the camera looks at and trails it slowly, so a street-level
    // view sees it overhead and a top-down view sees it below, without being glued to the view.
    flockFocus(camera, focus);
    if (centre.current === null) centre.current = focus.clone();
    else centre.current.lerp(focus, Math.min(1, delta * 0.05));
    const time = clock.getElapsedTime();
    material.uniforms.uTime!.value = time;
    material.uniforms.uOpacity!.value = Math.min(1, presence.current * 1.2);
    const { count, height, radius } = flock;
    const middle = centre.current;
    uploadInstances(
      instanced,
      {
        count,
        at: (index, out) => {
          const orbit = radius * (0.55 + ((index * 0.618) % 1) * 0.6);
          const speed = (0.11 + (index % 4) * 0.012) * (index % 2 === 0 ? 1 : 0.92);
          const angle = time * speed + index * 2.39996;
          const lift = height + Math.sin(time * 0.31 + index) * 3 + (index % 5) * 1.6;
          birdPosition.set(middle.x + Math.cos(angle) * orbit, lift, middle.z + Math.sin(angle) * orbit);
          birdEuler.set(0, -angle, Math.sin(time * 0.5 + index) * 0.25);
          birdQuaternion.setFromEuler(birdEuler);
          birdScale.setScalar(0.9 + (index % 3) * 0.15);
          out.compose(birdPosition, birdQuaternion, birdScale);
        },
      },
      { bounds: "none", dynamic: true },
    );
  });
  return <instancedMesh ref={mesh} args={[geometry, material, flock.count]} frustumCulled={false} renderOrder={2} />;
}

const LITTER_VERTEX = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec3 uAnchor;
  uniform vec2 uWind;
  uniform float uGround;
  uniform float uSpan;
  varying float vShade;
  void main() {
    float id = float(gl_InstanceID);
    vec2 drift = uWind * uTime * (0.55 + aSeed.x * 0.5);
    vec2 cell = mod(aSeed.yz * uSpan + drift - uAnchor.xz + uSpan * 0.5, uSpan) - uSpan * 0.5;
    float hop = abs(sin(uTime * (1.4 + aSeed.x) + id)) * (0.15 + length(uWind) * 0.05);
    float spin = uTime * (2.0 + aSeed.y * 4.0) + id;
    vec3 p = position;
    p.xy = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * p.xy;
    p.yz = mat2(cos(spin * 0.7), -sin(spin * 0.7), sin(spin * 0.7), cos(spin * 0.7)) * p.yz;
    vec3 world = vec3(uAnchor.x + cell.x, uGround + 0.08 + hop, uAnchor.z + cell.y) + p;
    vShade = 0.65 + aSeed.z * 0.35;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;
const LITTER_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vShade;
  void main() { gl_FragColor = vec4(vec3(0.82, 0.8, 0.74) * vShade, uOpacity); }
`;

function Litter({ litter }: { litter: NonNullable<ResolvedAmbientLife["litter"]> }) {
  const geometry = useDisposable(() => {
    const quad = new THREE.PlaneGeometry(0.22, 0.16);
    const instanced = new THREE.InstancedBufferGeometry().copy(quad as unknown as THREE.InstancedBufferGeometry);
    quad.dispose();
    const seeds = new Float32Array(litter.count * 3);
    for (let index = 0; index < seeds.length; index += 1) seeds[index] = (Math.sin(index * 91.7 + 13.1) * 43758.5453) % 1;
    for (let index = 0; index < seeds.length; index += 1) seeds[index] = Math.abs(seeds[index]!);
    instanced.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 3));
    instanced.instanceCount = litter.count;
    return instanced;
  }, [litter.count]);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uAnchor: { value: new THREE.Vector3() },
          uWind: { value: new THREE.Vector2() },
          uGround: { value: litter.groundY },
          uSpan: { value: 36 },
          uOpacity: { value: 0 },
        },
        vertexShader: LITTER_VERTEX,
        fragmentShader: LITTER_FRAGMENT,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    [litter.groundY],
  );
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(({ camera, clock }) => {
    const speed = livingWorld.wind.length();
    const strength = Math.min(1, Math.max(0, (speed - 1) / 3)) * (1 - livingWorld.wetness * 0.8);
    if (mesh.current !== null) mesh.current.visible = strength > 0.02;
    material.uniforms.uOpacity!.value = strength;
    material.uniforms.uTime!.value = clock.getElapsedTime();
    (material.uniforms.uAnchor!.value as THREE.Vector3).copy(camera.position);
    (material.uniforms.uWind!.value as THREE.Vector2).copy(livingWorld.wind);
  });
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />;
}

const STEAM_VERTEX = /* glsl */ `
  attribute vec3 aVent;
  attribute vec3 aShape;
  uniform float uTime;
  uniform vec2 uWind;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    float id = float(gl_InstanceID);
    float life = fract(uTime * 0.22 + id * 0.137);
    float rise = aShape.y;
    vec3 centre = aVent + vec3(uWind.x * life * 0.6, life * rise, uWind.y * life * 0.6);
    centre.x += sin(id * 3.1 + uTime * 0.7) * life * aShape.x * 0.6;
    centre.z += cos(id * 2.3 + uTime * 0.6) * life * aShape.x * 0.6;
    float size = aShape.x * (0.6 + life * 1.8);
    vec4 view = viewMatrix * vec4(centre, 1.0);
    view.xy += position.xy * size;
    vUv = uv;
    vLife = life;
    gl_Position = projectionMatrix * view;
  }
`;
const STEAM_FRAGMENT = /* glsl */ `
  uniform float uDensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float soft = smoothstep(1.0, 0.1, d);
    float alpha = soft * smoothstep(0.0, 0.12, vLife) * (1.0 - vLife) * uDensity * 0.32;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const STEAM_PUFFS = 14;

function Steam({ vents, lowTier }: { vents: readonly Required<SteamVent>[]; lowTier: boolean }) {
  const puffs = lowTier ? 8 : STEAM_PUFFS;
  const geometry = useDisposable(() => {
    const quad = new THREE.PlaneGeometry(1, 1);
    const instanced = new THREE.InstancedBufferGeometry().copy(quad as unknown as THREE.InstancedBufferGeometry);
    quad.dispose();
    const count = vents.length * puffs;
    const vent = new Float32Array(count * 3);
    const shape = new Float32Array(count * 3);
    vents.forEach((source, ventIndex) => {
      for (let puff = 0; puff < puffs; puff += 1) {
        const at = (ventIndex * puffs + puff) * 3;
        vent.set(source.position, at);
        shape.set([source.size, source.rise, 0], at);
      }
    });
    instanced.setAttribute("aVent", new THREE.InstancedBufferAttribute(vent, 3));
    instanced.setAttribute("aShape", new THREE.InstancedBufferAttribute(shape, 3));
    instanced.instanceCount = count;
    return instanced;
  }, [vents, puffs]);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uDensity: { value: 0.5 }, uColor: { value: new THREE.Color(0.86, 0.88, 0.9) } },
        vertexShader: STEAM_VERTEX,
        fragmentShader: STEAM_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime!.value = clock.getElapsedTime();
    (material.uniforms.uWind!.value as THREE.Vector2).copy(livingWorld.wind);
    material.uniforms.uDensity!.value = steamDensity(livingWorld.sunHeight, livingWorld.rain);
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

/**
 * The world's weather and daylight brought to its surfaces and its small life: rain soaks every lit
 * surface and fills puddles, the weather's wind bends every plant and flag, and birds, litter and
 * steam come and go with the time and the weather. Birds need a sky, so interiors never get them.
 * Mount once per 3D world.
 * @internal
 */
export function LivingWorld({ ambientLife, lowTier, outdoor }: { ambientLife: AmbientLifeConfig | false | undefined; lowTier: boolean; outdoor: boolean }) {
  const life = useMemo(() => resolveAmbientLife(ambientLife, lowTier), [ambientLife, lowTier]);
  return (
    <>
      <LivingWorldDriver />
      {life.birds === null || !outdoor ? null : <Birds flock={life.birds} />}
      {life.litter === null ? null : <Litter litter={life.litter} />}
      {life.steam.length === 0 ? null : <Steam vents={life.steam} lowTier={lowTier} />}
    </>
  );
}
