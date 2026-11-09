import { useRef } from "react";
import * as THREE from "three";

import { resolveAmbientLife, type AmbientLifeConfig, type ResolvedAmbientLife, type SteamVent } from "@jgengine/core/render/ambientLife";

import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { findKeyLight, towardLight } from "@jgengine/core/postfx/contactShadowPass.draw";
import { advanceLivingWorld, livingWorld, resetLivingWorld } from "./livingWorld.draw";
import { windDirection, windGust } from "@jgengine/core/model/modelWind.draw";
import { prepareBeforeLink, prepareBeforeWarmup } from "@jgengine/core/render/shaderWarmup.draw";
import { applyWetness, applyWetnessToScene, takesWetness } from "@jgengine/core/material/wetSurfaces.draw";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

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

/**
 * Draw-side form of the old `LivingWorldDriver`: rescans the key light, advances the shared
 * `livingWorld` record, publishes wind direction/gust, and applies wetness on its scan cadence.
 * Installs the warmup/link wetness hooks on the real scene and resets the shared record on dispose.
 */
export function livingWorldDriverDraw(): EngineDraw {
  let light: THREE.DirectionalLight | null = null;
  let sinceScan = LIGHT_RESCAN_SECONDS;
  let sinceWet = WET_SCAN_SECONDS;
  let scene: THREE.Scene | null = null;
  let offWarmup: (() => void) | null = null;
  let offLink: (() => void) | null = null;
  return {
    priority: -1,
    mount(state: EngineFrameState) {
      const target = state.rootScene ?? state.scene;
      scene = target;
      offWarmup = prepareBeforeWarmup(target, () => {
        if (livingWorld.wetness > 0) applyWetnessToScene(target);
      });
      offLink = prepareBeforeLink(target, (material) => {
        if (livingWorld.wetness > 0 && takesWetness(material)) applyWetness(material as THREE.MeshStandardMaterial);
      });
    },
    frame(_state: EngineFrameState, delta: number) {
      if (scene === null) return;
      sinceScan += delta;
      if (sinceScan >= LIGHT_RESCAN_SECONDS || light?.parent === null) {
        light = findKeyLight(scene);
        sinceScan = 0;
      }
      const sunHeight = light === null ? null : towardLight(light, sunDirection).y;
      advanceLivingWorld(delta, sunHeight);
      const wind = livingWorld.wind;
      const speed = wind.length();
      if (speed > 0.05) windDirection.copy(wind).divideScalar(speed);
      windGust.value = gustForWind(speed);
      sinceWet += delta;
      if (livingWorld.wetness > 0 && sinceWet >= WET_SCAN_SECONDS) {
        applyWetnessToScene(scene);
        sinceWet = 0;
      }
    },
    dispose() {
      offWarmup?.();
      offLink?.();
      offWarmup = null;
      offLink = null;
      scene = null;
      light = null;
      resetLivingWorld();
      windGust.value = 1;
    },
  };
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

/** Props for {@link birdsDraw}: the resolved flock parameters. */
export interface BirdsDrawProps {
  flock: NonNullable<ResolvedAmbientLife["birds"]>;
}

/**
 * Draw-side form of `Birds`: an instanced gull flock orbiting the camera's look point, fading in
 * only in fair daylight. Geometry and shader material are owned and disposed here.
 */
export function birdsDraw(getProps: () => BirdsDrawProps): EngineDraw {
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.ShaderMaterial | null = null;
  let mesh: THREE.InstancedMesh | null = null;
  let centre: THREE.Vector3 | null = null;
  let presence: number | null = null;
  return {
    mount(state: EngineFrameState) {
      geometry = birdGeometry();
      material = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
        vertexShader: BIRD_VERTEX,
        fragmentShader: BIRD_FRAGMENT,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      mesh = new THREE.InstancedMesh(geometry, material, getProps().flock.count);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      state.scene.add(mesh);
    },
    frame(state: EngineFrameState, delta: number) {
      if (mesh === null || material === null) return;
      const target = birdPresence(livingWorld.sunHeight, livingWorld.rain);
      presence = presence === null ? target : presence + (target - presence) * Math.min(1, delta * 0.4);
      mesh.visible = presence > 0.02;
      if (!mesh.visible) return;
      // The flock circles over the ground the camera looks at and trails it slowly, so a street-level
      // view sees it overhead and a top-down view sees it below, without being glued to the view.
      const flock = getProps().flock;
      flockFocus(state.camera, focus);
      if (centre === null) centre = focus.clone();
      else centre.lerp(focus, Math.min(1, delta * 0.05));
      const time = state.elapsed;
      material.uniforms["uTime"]!.value = time;
      material.uniforms["uOpacity"]!.value = Math.min(1, presence * 1.2);
      const { count, height, radius } = flock;
      const middle = centre;
      uploadInstances(
        mesh,
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
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh.dispose();
        mesh = null;
      }
      geometry?.dispose();
      geometry = null;
      material?.dispose();
      material = null;
      centre = null;
      presence = null;
    },
  };
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

/** Props for {@link litterDraw}: the resolved drifting-debris field. */
export interface LitterDrawProps {
  litter: NonNullable<ResolvedAmbientLife["litter"]>;
}

function litterGeometry(count: number): THREE.InstancedBufferGeometry {
  const quad = new THREE.PlaneGeometry(0.22, 0.16);
  const instanced = new THREE.InstancedBufferGeometry().copy(quad as unknown as THREE.InstancedBufferGeometry);
  quad.dispose();
  const seeds = new Float32Array(count * 3);
  for (let index = 0; index < seeds.length; index += 1) seeds[index] = (Math.sin(index * 91.7 + 13.1) * 43758.5453) % 1;
  for (let index = 0; index < seeds.length; index += 1) seeds[index] = Math.abs(seeds[index]!);
  instanced.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 3));
  instanced.instanceCount = count;
  return instanced;
}

/**
 * Draw-side form of `Litter`: wind-blown debris on a camera-anchored ground plane, visible only
 * while the wind is up. Rebuilds geometry on `count` and material on `groundY`, matching the old
 * `useDisposable` dep boundaries.
 */
export function litterDraw(getProps: () => LitterDrawProps): EngineDraw {
  let geometry: THREE.InstancedBufferGeometry | null = null;
  let material: THREE.ShaderMaterial | null = null;
  let mesh: THREE.Mesh | null = null;
  let builtCount = -1;
  let builtGround = Number.NaN;
  const buildAssets = (state: EngineFrameState) => {
    const { litter } = getProps();
    if (mesh !== null) {
      state.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh = null;
    }
    geometry = litterGeometry(litter.count);
    material = new THREE.ShaderMaterial({
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
    });
    mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    state.scene.add(mesh);
    builtCount = litter.count;
    builtGround = litter.groundY;
  };
  return {
    mount(state: EngineFrameState) {
      buildAssets(state);
    },
    update(state: EngineFrameState) {
      const { litter } = getProps();
      if (litter.count !== builtCount || litter.groundY !== builtGround) buildAssets(state);
    },
    frame(state: EngineFrameState) {
      if (mesh === null || material === null) return;
      const speed = livingWorld.wind.length();
      const strength = Math.min(1, Math.max(0, (speed - 1) / 3)) * (1 - livingWorld.wetness * 0.8);
      mesh.visible = strength > 0.02;
      material.uniforms["uOpacity"]!.value = strength;
      material.uniforms["uTime"]!.value = state.elapsed;
      (material.uniforms["uAnchor"]!.value as THREE.Vector3).copy(state.camera.position);
      (material.uniforms["uWind"]!.value as THREE.Vector2).copy(livingWorld.wind);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh = null;
      }
      geometry?.dispose();
      geometry = null;
      material?.dispose();
      material = null;
      builtCount = -1;
      builtGround = Number.NaN;
    },
  };
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

/** Props for {@link steamDraw}: the vent list and the quality tier that thins it. */
export interface SteamDrawProps {
  vents: readonly Required<SteamVent>[];
  lowTier: boolean;
}

function steamGeometry(vents: readonly Required<SteamVent>[], puffs: number): THREE.InstancedBufferGeometry {
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
}

/**
 * Draw-side form of `Steam`: rising vent puffs whose density follows cold and rain. Rebuilds the
 * instanced geometry when the vent list or puff count changes, matching the old `useDisposable`
 * deps.
 */
export function steamDraw(getProps: () => SteamDrawProps): EngineDraw {
  let geometry: THREE.InstancedBufferGeometry | null = null;
  let material: THREE.ShaderMaterial | null = null;
  let mesh: THREE.Mesh | null = null;
  let builtVents: readonly Required<SteamVent>[] | null = null;
  let builtPuffs = -1;
  const rebuildGeometry = () => {
    const { vents, lowTier } = getProps();
    const puffs = lowTier ? 8 : STEAM_PUFFS;
    geometry?.dispose();
    geometry = steamGeometry(vents, puffs);
    if (mesh !== null) mesh.geometry = geometry;
    builtVents = vents;
    builtPuffs = puffs;
  };
  return {
    mount(state: EngineFrameState) {
      const { vents, lowTier } = getProps();
      const puffs = lowTier ? 8 : STEAM_PUFFS;
      geometry = steamGeometry(vents, puffs);
      material = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uDensity: { value: 0.5 }, uColor: { value: new THREE.Color(0.86, 0.88, 0.9) } },
        vertexShader: STEAM_VERTEX,
        fragmentShader: STEAM_FRAGMENT,
        transparent: true,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      state.scene.add(mesh);
      builtVents = vents;
      builtPuffs = puffs;
    },
    update() {
      const { vents, lowTier } = getProps();
      const puffs = lowTier ? 8 : STEAM_PUFFS;
      if (vents !== builtVents || puffs !== builtPuffs) rebuildGeometry();
    },
    frame(state: EngineFrameState) {
      if (material === null) return;
      material.uniforms["uTime"]!.value = state.elapsed;
      (material.uniforms["uWind"]!.value as THREE.Vector2).copy(livingWorld.wind);
      material.uniforms["uDensity"]!.value = steamDensity(livingWorld.sunHeight, livingWorld.rain);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh = null;
      }
      geometry?.dispose();
      geometry = null;
      material?.dispose();
      material = null;
      builtVents = null;
      builtPuffs = -1;
    },
  };
}

/** Props for {@link LivingWorld}: the ambient-life config, quality tier and indoor flag. */
export interface LivingWorldProps {
  ambientLife: AmbientLifeConfig | false | undefined;
  lowTier: boolean;
  outdoor: boolean;
}

/**
 * Draw-side form of `LivingWorld`'s visual half: resolves the ambient-life config and mounts the
 * bird flock, drifting litter and steam vents that apply. The wetness/wind driver mounts beside
 * this draw through its own `EngineDrawMount` so its `-1` frame priority survives.
 */
export function livingWorldVisualsDraw(getProps: () => LivingWorldProps): EngineDraw {
  const host = new THREE.Group();
  interface Slot {
    key: object | null;
    draw: EngineDraw | null;
    state: EngineFrameState | null;
  }
  const slots: Record<"birds" | "litter" | "steam", Slot> = {
    birds: { key: null, draw: null, state: null },
    litter: { key: null, draw: null, state: null },
    steam: { key: null, draw: null, state: null },
  };
  let life: ResolvedAmbientLife | null = null;
  let builtLife: { ambientLife: LivingWorldProps["ambientLife"]; lowTier: boolean } | null = null;
  let mountState: EngineFrameState | null = null;

  const syncLife = () => {
    const props = getProps();
    if (builtLife === null || props.ambientLife !== builtLife.ambientLife || props.lowTier !== builtLife.lowTier) {
      life = resolveAmbientLife(props.ambientLife, props.lowTier);
      builtLife = { ambientLife: props.ambientLife, lowTier: props.lowTier };
    }
  };

  const disposeSlot = (slot: Slot) => {
    if (slot.draw !== null && slot.state !== null) slot.draw.dispose?.(slot.state);
    slot.draw = null;
    slot.state = null;
    slot.key = null;
  };

  const setSlot = (slot: Slot, key: object | null, make: (() => EngineDraw) | null) => {
    if (slot.key === key && (key === null) === (slot.draw === null)) return;
    disposeSlot(slot);
    if (key !== null && make !== null && mountState !== null) {
      slot.state = childFrameState(mountState, host);
      slot.draw = make();
      slot.draw.mount?.(slot.state);
      slot.key = key;
    }
  };

  const reconcile = () => {
    syncLife();
    const props = getProps();
    const resolved = life;
    if (resolved === null) return;
    const birds = resolved.birds;
    setSlot(slots.birds, birds !== null && props.outdoor ? birds : null, birds === null ? null : () => birdsDraw(() => ({ flock: birds })));
    const litter = resolved.litter;
    setSlot(slots.litter, litter, litter === null ? null : () => litterDraw(() => ({ litter })));
    const steam = resolved.steam.length === 0 ? null : resolved.steam;
    setSlot(slots.steam, steam, steam === null ? null : () => steamDraw(() => ({ vents: steam, lowTier: props.lowTier })));
  };

  return {
    mount(state: EngineFrameState) {
      mountState = state;
      state.scene.add(host);
      reconcile();
    },
    update() {
      reconcile();
      for (const slot of Object.values(slots)) if (slot.draw !== null && slot.state !== null) slot.draw.update?.(slot.state);
    },
    frame(state: EngineFrameState) {
      for (const slot of Object.values(slots)) if (slot.draw !== null && slot.state !== null) slot.draw.frame?.(slot.state, state.delta);
    },
    dispose(state: EngineFrameState) {
      for (const slot of Object.values(slots)) disposeSlot(slot);
      state.scene.remove(host);
      host.clear();
      mountState = null;
      life = null;
      builtLife = null;
    },
  };
}

/**
 * The world's weather and daylight brought to its surfaces and its small life: rain soaks every lit
 * surface and fills puddles, the weather's wind bends every plant and flag, and birds, litter and
 * steam come and go with the time and the weather. Birds need a sky, so interiors never get them.
 * Mount once per 3D world.
 * @internal
 */
export function LivingWorld(props: LivingWorldProps) {
  const latest = useRef<LivingWorldProps>(props);
  latest.current = props;
  return (
    <>
      <EngineDrawMount create={() => livingWorldDriverDraw()} deps={[]} />
      <EngineDrawMount create={() => livingWorldVisualsDraw(() => latest.current)} deps={[]} />
    </>
  );
}
