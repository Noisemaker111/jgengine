/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, type MutableRefObject } from "@jgengine/core/ui/jsx";
import { PerspectiveCamera, Quaternion, Vector3, type Camera } from "three";

import type {
  ChaseCameraConfig,
  ChaseView,
  GameCameraConfig,
  LockOnCameraConfig,
  ObserverCameraConfig,
  RtsCameraConfig,
  ShoulderCameraConfig,
  SideScrollCameraConfig,
  TopDownCameraConfig,
} from "@jgengine/core/game/playableGame";
import { snapPixelPerfectPosition } from "@jgengine/core/game/pixelPerfect";
import { clamp } from "@jgengine/core/math/scalar";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RenderPose } from "@jgengine/core/runtime/poseInterpolation";
import { usePlayer } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { ORBIT_CAMERA_FRAME_PRIORITY } from "./orbitCameraMath";
import {
  cinematicSample,
  clampBoomToHit,
  createChaseRigState,
  lockOnPose,
  observerPose,
  resolveChase,
  resolveObserver,
  resolveShoulder,
  resolveSideScroll,
  resolveSideScrollPose,
  resolveTopDown,
  rtsPanWorldDir,
  applyRtsCenter,
  seatPose,
  shoulderPose,
  sideScrollFollowBlend,
  smoothYaw,
  stepChase,
  topDownPose,
  type CameraPose,
  type ChaseRigState,
} from "./rigMath";
import { usePlayerFov } from "./PlayerFov.draw";
import { applyCameraShake, useCameraShake } from "@jgengine/core/camera/shake/shakeChannel.draw";
import {
  applyCameraBlendStep,
  captureCameraBlendFrom,
  createCameraBlendScratch,
} from "./cameraBlendMath.draw";
import { requestRawPointerLock } from "@jgengine/core/input/pointerLock";
import { resolveChaseHeading } from "./chaseHeading";

import type { Xyz } from "@jgengine/core/math/xyz";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

/** useFrame priority every camera rig commits its pose at, after the game simulation. */
export const CAMERA_RIG_FRAME_PRIORITY = ORBIT_CAMERA_FRAME_PRIORITY;
/** useFrame priority for work that must read the camera after the rig moved it this frame (culling, HUD anchors, LOD). */
export const CAMERA_POST_FRAME_PRIORITY = ORBIT_CAMERA_FRAME_PRIORITY + 0.5;

/** Props shared by every camera rig: look refs, the game's camera config and the followed entity. */
export interface RigProps {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  config?: GameCameraConfig | undefined;
  followEntityId?: string | null | undefined;
  /** When true, pose FOV is treated as absolute (cinematic keyframes). */
  absoluteFov?: boolean;
}

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

function currentFov(camera: Camera): number {
  return isPerspective(camera) ? camera.fov : 55;
}

function applyPose(camera: Camera, pose: CameraPose): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  if (isPerspective(camera) && Math.abs(camera.fov - pose.fov) > 0.001) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

function resolveFollowId(explicit: string | null | undefined, userId: string): string | null {
  if (explicit === null) return null;
  return explicit ?? userId;
}

interface FollowSample {
  pos: Xyz;
  yaw: number;
}

const followPose: RenderPose = [0, 0, 0, 0];

function readFollow(ctx: GameContext, followId: string | null): FollowSample | null {
  if (followId === null) return null;
  // The drawn pose, not the live one: under a fixed step the camera then moves with the interpolated body.
  if (!ctx.sim.renderPose(followId, followPose)) return null;
  return {
    pos: { x: followPose[0], y: followPose[1], z: followPose[2] },
    yaw: followPose[3],
  };
}
/** Everything a rig draw reads live: latest props plus the UI-side singletons its wrapper resolved. */
export interface CameraRigEnv {
  props: RigProps & { panKeysEnabled?: boolean | undefined; rotateKeysEnabled?: boolean | undefined; onComplete?: (() => void) | undefined };
  ctx: GameContext;
  userId: string;
  shake: ReturnType<typeof useCameraShake>;
  playerFov: ReturnType<typeof usePlayerFov>;
}

const ZERO: Xyz = { x: 0, y: 0, z: 0 };

/**
 * Draw-side form of the old `useCameraCommit`: the crossfade blend captured on a rig swap, the
 * trauma-channel shake and the `onCameraFollow` report every rig funnels through. `commit` takes
 * the frame state's camera; `beginTransition` runs on mount and on the rig's own swap signals.
 */
function createCameraCommit(getEnv: () => CameraRigEnv) {
  const blendScratch = createCameraBlendScratch(Vector3, Quaternion);
  let blending = false;
  let farWarned = false;

  const beginTransition = (camera: Camera) => {
    const transitionSeconds = getEnv().props.config?.transitionSeconds ?? 0.6;
    if (transitionSeconds <= 0) return;
    captureCameraBlendFrom(blendScratch, camera.position, camera.quaternion, currentFov(camera), transitionSeconds);
    blending = true;
  };

  const commit = (camera: Camera, pose: CameraPose, dt: number, followOverride?: string | null) => {
    const env = getEnv();
    const props = env.props;
    const followId = followOverride !== undefined ? followOverride : resolveFollowId(props.followEntityId, env.userId);
    const composed: CameraPose = {
      ...pose,
      fov: env.playerFov.compose(pose.fov, props.absoluteFov === true ? "absolute" : "relative"),
    };
    applyPose(camera, composed);

    const lookDistance = Math.hypot(
      pose.position.x - pose.lookAt.x,
      pose.position.y - pose.lookAt.y,
      pose.position.z - pose.lookAt.z,
    );
    if (!farWarned && isPerspective(camera) && lookDistance > camera.far) {
      farWarned = true;
      console.warn(
        `[jgengine:camera] the "${props.config?.rig ?? "orbit"}" rig placed the camera ${Math.round(lookDistance)} world units from its look target, beyond the far plane (${camera.far}) â€” everything near the target is frustum-culled and the world renders empty. Check the rig config (topDown pitch is elevation: PI/2 = straight down, near 0 = grazing) or raise camera.frustum.far.`,
      );
    }

    if (blending) {
      const done = applyCameraBlendStep(blendScratch, camera, composed.fov, dt);
      if (done) blending = false;
    }

    applyCameraShake(camera, env.shake, dt);

    props.config?.follow?.onCameraFollow?.({
      entityId: followId ?? "",
      target: composed.lookAt,
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      distance: Math.hypot(
        camera.position.x - composed.lookAt.x,
        camera.position.y - composed.lookAt.y,
        camera.position.z - composed.lookAt.z,
      ),
    });
  };

  return { beginTransition, commit };
}

/** Draw-side form of `useHeldKeys`: window key listeners maintaining a held-code set. */
function createHeldKeys(getCodes: () => readonly string[]): { held: Set<string>; sync(): void; dispose(): void } {
  const held = new Set<string>();
  let codesKey = "";
  const down = (event: KeyboardEvent) => {
    if (codeSet.has(event.code)) held.add(event.code);
  };
  const up = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  let codeSet = new Set<string>();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  return {
    held,
    sync() {
      const codes = getCodes();
      const key = codes.join(",");
      if (key === codesKey) return;
      codesKey = key;
      codeSet = new Set(codes);
    },
    dispose() {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      held.clear();
    },
  };
}

/** Resolve-and-cache helper: `resolveX(config)` results keyed on config identity, like the old memos. */
function memoConfig<T>(resolve: (config: unknown) => T): (config: unknown) => T {
  let entry: { config: unknown; value: T } | null = null;
  return (config) => {
    if (entry === null || entry.config !== config) entry = { config, value: resolve(config) };
    return entry.value;
  };
}

const UNSET_CONFIG = Symbol("unset-config");

/** Overhead follow rig at a fixed height and angle. */
export function topDownRigDraw(getEnv: () => CameraRigEnv): EngineDraw {
  const commit = createCameraCommit(getEnv);
  const resolve = memoConfig((config: unknown) => resolveTopDown(config as TopDownCameraConfig | undefined));
  let follow: Xyz | null = null;
  let zoomValue = { current: 0 };
  let lastInitial = Number.NaN;
  const wheelSpec = () => {
    const env = getEnv();
    const config = env.props.config?.rigs?.topDown;
    const resolved = resolve(config);
    return {
      initial: resolved.height,
      min: (config?.zoom?.min ?? 0.6) * resolved.height,
      max: (config?.zoom?.max ?? 1.8) * resolved.height,
      speed: config?.zoom?.speed ?? resolved.height * 0.08,
    };
  };
  return {
    priority: CAMERA_RIG_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      commit.beginTransition(state.camera);
      const spec = wheelSpec();
      lastInitial = spec.initial;
      zoomValue.current = spec.initial;
      state.gl.domElement.addEventListener("wheel", onWheel);
    },
    update() {
      const spec = wheelSpec();
      if (spec.initial !== lastInitial) {
        lastInitial = spec.initial;
        zoomValue.current = spec.initial;
      }
    },
    frame(state: EngineFrameState, dt: number) {
      const env = getEnv();
      const followId = resolveFollowId(env.props.followEntityId, env.userId);
      const config = env.props.config?.rigs?.topDown;
      const resolved = resolve(config);
      const sample = readFollow(env.ctx, followId);
      const desired = sample?.pos ?? ZERO;
      const prev = follow ?? desired;
      const blend = 1 - Math.exp(-resolved.followSmoothing * dt);
      follow = {
        x: prev.x + (desired.x - prev.x) * blend,
        y: prev.y + (desired.y - prev.y) * blend,
        z: prev.z + (desired.z - prev.z) * blend,
      };
      env.props.yawRef.current = resolved.yaw;
      const pose = topDownPose(follow, { ...resolved, height: zoomValue.current }, currentFov(state.camera));
      commit.commit(state.camera, pose, dt);
    },
    dispose(state: EngineFrameState) {
      state.gl.domElement.removeEventListener("wheel", onWheel);
      follow = null;
    },
  };
  function onWheel(event: WheelEvent) {
    if (event.shiftKey) return;
    const spec = wheelSpec();
    zoomValue.current = clamp(zoomValue.current + Math.sign(event.deltaY) * spec.speed, spec.min, spec.max);
  }
}

/** Fixed side-on 2.5D follow rig: watches the followed entity from the perpendicular axis, never reading WASD/mouse-look. */
export function sideScrollRigDraw(getEnv: () => CameraRigEnv): EngineDraw {
  const commit = createCameraCommit(getEnv);
  const resolve = memoConfig((config: unknown) => resolveSideScroll(config as SideScrollCameraConfig | undefined));
  let follow: Xyz | null = null;
  return {
    priority: CAMERA_RIG_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      commit.beginTransition(state.camera);
    },
    frame(state: EngineFrameState, dt: number) {
      const env = getEnv();
      const followId = resolveFollowId(env.props.followEntityId, env.userId);
      const config = env.props.config?.rigs?.sideScroll as SideScrollCameraConfig | undefined;
      const resolved = resolve(config);
      const sample = readFollow(env.ctx, followId);
      const desired = sample?.pos ?? ZERO;
      const prev = follow ?? desired;
      const blend = sideScrollFollowBlend(resolved.followSmoothing, dt);
      follow = {
        x: prev.x + (desired.x - prev.x) * blend,
        y: prev.y + (desired.y - prev.y) * blend,
        z: prev.z + (desired.z - prev.z) * blend,
      };
      const pose = resolveSideScrollPose(follow, resolved, config?.fov ?? currentFov(state.camera));
      const pixelPerfect = env.props.config?.lens?.projection === "orthographic" ? env.props.config.lens?.pixelPerfect : undefined;
      if (pixelPerfect !== undefined) {
        const snapped = snapPixelPerfectPosition(pose.position, pixelPerfect.pixelsPerUnit);
        pose.position = snapped;
        pose.lookAt = snapPixelPerfectPosition(pose.lookAt, pixelPerfect.pixelsPerUnit);
      }
      commit.commit(state.camera, pose, dt);
    },
    dispose() {
      follow = null;
    },
  };
}

const RTS_PAN_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyQ", "KeyE"];
const RTS_WASD_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
const RTS_ROTATE_KEYS = new Set(["KeyQ", "KeyE"]);

/** Strategy rig that pans with keys or screen edges, zooms and rotates over the map. */
export function rtsRigDraw(getEnv: () => CameraRigEnv): EngineDraw {
  const commit = createCameraCommit(getEnv);
  const resolve = memoConfig((config: unknown) => resolveTopDown(config as RtsCameraConfig | undefined));
  let center: Xyz | null = null;
  let yaw = 0;
  let pointer: { nx: number; ny: number } | null = null;
  let zoomValue = { current: 0 };
  let lastInitial = Number.NaN;
  const held = createHeldKeys(() => {
    const env = getEnv();
    const followId = resolveFollowId(env.props.followEntityId, env.userId);
    const wasdPanEnabled = followId === null && env.props.panKeysEnabled !== false;
    const rotateKeysEnabled = env.props.rotateKeysEnabled !== false;
    return RTS_PAN_KEYS.filter((code) =>
      (wasdPanEnabled || !RTS_WASD_KEYS.has(code)) && (rotateKeysEnabled || !RTS_ROTATE_KEYS.has(code)));
  });
  const wheelSpec = () => {
    const env = getEnv();
    const config = env.props.config?.rigs?.rts as RtsCameraConfig | undefined;
    const resolved = resolve(config);
    return {
      initial: resolved.height,
      min: (config?.zoom?.min ?? 0.5) * resolved.height,
      max: (config?.zoom?.max ?? 2.2) * resolved.height,
      speed: config?.zoom?.speed ?? resolved.height * 0.09,
    };
  };
  const onWheel = (event: WheelEvent) => {
    if (event.shiftKey) return;
    const spec = wheelSpec();
    zoomValue.current = clamp(zoomValue.current + Math.sign(event.deltaY) * spec.speed, spec.min, spec.max);
  };
  let domElement: HTMLElement | null = null;
  const onPointerMove = (event: PointerEvent) => {
    if (domElement === null) return;
    const rect = domElement.getBoundingClientRect();
    pointer = { nx: (event.clientX - rect.left) / rect.width, ny: (event.clientY - rect.top) / rect.height };
  };
  const onPointerLeave = () => {
    pointer = null;
  };
  return {
    priority: CAMERA_RIG_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      commit.beginTransition(state.camera);
      domElement = state.gl.domElement;
      domElement.addEventListener("wheel", onWheel);
      domElement.addEventListener("pointermove", onPointerMove);
      domElement.addEventListener("pointerleave", onPointerLeave);
      const spec = wheelSpec();
      lastInitial = spec.initial;
      zoomValue.current = spec.initial;
      const env = getEnv();
      const config = env.props.config?.rigs?.rts as RtsCameraConfig | undefined;
      center = { x: config?.start?.x ?? 0, y: 0, z: config?.start?.z ?? 0 };
      yaw = resolve(config).yaw;
      held.sync();
    },
    update() {
      held.sync();
      const spec = wheelSpec();
      if (spec.initial !== lastInitial) {
        lastInitial = spec.initial;
        zoomValue.current = spec.initial;
      }
    },
    frame(state: EngineFrameState, dt: number) {
      const env = getEnv();
      held.sync();
      const followId = resolveFollowId(env.props.followEntityId, env.userId);
      const config = env.props.config?.rigs?.rts as RtsCameraConfig | undefined;
      const resolved = resolve(config);
      const keys = held.held;
      if (keys.has("KeyQ")) yaw += (config?.rotateSpeed ?? 1.4) * dt;
      if (keys.has("KeyE")) yaw -= (config?.rotateSpeed ?? 1.4) * dt;

      let panX = 0;
      let panZ = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) panZ += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) panZ -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) panX += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) panX -= 1;

      const edgeScroll = config?.edgeScroll ?? true;
      const edgeMargin = typeof edgeScroll === "object" ? edgeScroll.margin ?? 0.04 : 0.04;
      const panSpeed = config?.panSpeed ?? 24;
      if (edgeScroll !== false && pointer !== null) {
        if (pointer.nx < edgeMargin) panX -= 1;
        else if (pointer.nx > 1 - edgeMargin) panX += 1;
        if (pointer.ny < edgeMargin) panZ += 1;
        else if (pointer.ny > 1 - edgeMargin) panZ -= 1;
      }

      if (center === null) return;
      if (panX !== 0 || panZ !== 0) {
        const dir = rtsPanWorldDir(panX, panZ, yaw);
        center.x += dir.x * panSpeed * dt;
        center.z += dir.z * panSpeed * dt;
      } else {
        const sample = readFollow(env.ctx, followId);
        if (sample !== null) {
          center.x += (sample.pos.x - center.x) * (1 - Math.exp(-resolved.followSmoothing * dt));
          center.z += (sample.pos.z - center.z) * (1 - Math.exp(-resolved.followSmoothing * dt));
        }
      }

      applyRtsCenter(center, env.ctx.camera.takePanTo(), config?.bounds);

      env.props.yawRef.current = yaw;
      const pose = topDownPose(
        center,
        { ...resolved, yaw, height: zoomValue.current },
        currentFov(state.camera),
      );
      commit.commit(state.camera, pose, dt);
    },
    dispose(state: EngineFrameState) {
      held.dispose();
      const dom = state.gl.domElement;
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerleave", onPointerLeave);
      center = null;
      pointer = null;
      domElement = null;
    },
  };
}

/** Over-the-shoulder third-person rig with mouse look and shoulder offset. */
export function shoulderRigDraw(getEnv: () => CameraRigEnv): EngineDraw {
  const commit = createCameraCommit(getEnv);
  let side = 1;
  let aim = 0;
  let aiming = false;
  let domElement: HTMLElement | null = null;
  const shoulderConfig = () => getEnv().props.config?.rigs?.shoulder as ShoulderCameraConfig | undefined;
  const onMove = (event: MouseEvent) => {
    if (domElement === null || document.pointerLockElement !== domElement) return;
    const sensitivity = shoulderConfig()?.sensitivity ?? 0.0025;
    const env = getEnv();
    env.props.yawRef.current -= event.movementX * sensitivity;
    env.props.pitchRef.current = clamp(env.props.pitchRef.current - event.movementY * sensitivity, -1.2, 1.2);
  };
  const onDown = (event: MouseEvent) => {
    if (event.button === 2) aiming = true;
  };
  const onUp = (event: MouseEvent) => {
    if (event.button === 2) aiming = false;
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.code === "KeyV") side *= -1;
  };
  const onContext = (event: Event) => event.preventDefault();
  const requestLock = () => {
    if (domElement !== null && document.pointerLockElement !== domElement) requestRawPointerLock(domElement);
  };
  return {
    priority: CAMERA_RIG_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      commit.beginTransition(state.camera);
      domElement = state.gl.domElement;
      side = shoulderConfig()?.side === "left" ? -1 : 1;
      domElement.addEventListener("click", requestLock);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mousedown", onDown);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("keydown", onKey);
      domElement.addEventListener("contextmenu", onContext);
    },
    frame(state: EngineFrameState, dt: number) {
      const env = getEnv();
      const followId = resolveFollowId(env.props.followEntityId, env.userId);
      const config = env.props.config?.rigs?.shoulder as ShoulderCameraConfig | undefined;
      const turn = env.ctx.camera.takeTurnTo();
      if (turn !== null) env.props.yawRef.current = turn;
      const sample = readFollow(env.ctx, followId);
      const follow = sample?.pos ?? ZERO;
      const weapon = followId === null ? null : (env.props.config?.follow?.weapon?.(followId, env.ctx) ?? null);
      if (weapon === null) {
        const adsTarget = aiming ? 1 : 0;
        aim += (adsTarget - aim) * (1 - Math.exp(-(config?.adsTransitionSpeed ?? 10) * dt));
      } else aim = weapon.handling.adsProgress;
      const hip = resolveShoulder(config, false);
      const ads = resolveShoulder(config, true);
      const blended = {
        shoulderOffset: hip.shoulderOffset + (ads.shoulderOffset - hip.shoulderOffset) * aim,
        heightOffset: hip.heightOffset + (ads.heightOffset - hip.heightOffset) * aim,
        distance: hip.distance + (ads.distance - hip.distance) * aim,
        fov: hip.fov + (ads.fov - hip.fov) * aim,
      };
      const handling = weapon?.handling;
      const yaw = env.props.yawRef.current - (handling === undefined ? 0 : handling.aimYaw + handling.cameraYaw);
      // This rig's pitch is camera elevation, so a muzzle climb lowers it.
      const pitch = env.props.pitchRef.current - (handling === undefined ? 0 : handling.aimPitch + handling.cameraPitch);
      const pose = shoulderPose(follow, yaw, pitch, side, blended);
      commit.commit(state.camera, pose, dt);
    },
    dispose(state: EngineFrameState) {
      const dom = state.gl.domElement;
      dom.removeEventListener("click", requestLock);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      dom.removeEventListener("contextmenu", onContext);
      domElement = null;
    },
  };
}

function pickLockTarget(ctx: GameContext, followId: string | null, config: LockOnCameraConfig | undefined): string | null {
  if (config?.targetEntityId !== undefined) return config.targetEntityId;
  if (followId !== null) {
    const explicit = ctx.scene.entity.getTarget(followId);
    if (explicit !== null) return explicit;
  }
  let nearest: string | null = null;
  let best = Infinity;
  const origin = followId === null ? null : ctx.scene.entity.get(followId);
  if (origin === null) return null;
  for (const entity of ctx.scene.entity.list()) {
    if (entity.id === followId) continue;
    const dx = entity.position[0] - origin.position[0];
    const dz = entity.position[2] - origin.position[2];
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      nearest = entity.id;
    }
  }
  return nearest;
}

/** Rig that frames the player and a locked-on target together. */
export function lockOnRigDraw(getEnv: () => CameraRigEnv): EngineDraw {
  const commit = createCameraCommit(getEnv);
  let yaw = 0;
  let seeded = false;
  return {
    priority: CAMERA_RIG_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      commit.beginTransition(state.camera);
    },
    frame(state: EngineFrameState, dt: number) {
      const env = getEnv();
      const followId = resolveFollowId(env.props.followEntityId, env.userId);
      const config = env.props.config?.rigs?.lockOn as LockOnCameraConfig | undefined;
      const sample = readFollow(env.ctx, followId);
      const player = sample?.pos ?? ZERO;
      const targetId = pickLockTarget(env.ctx, followId, config);
      const targetEntity = targetId === null ? null : env.ctx.scene.entity.get(targetId);
      const target: Xyz = targetEntity === null
        ? { x: player.x, y: player.y, z: player.z + 1 }
        : { x: targetEntity.position[0], y: targetEntity.position[1], z: targetEntity.position[2] };

      const { pose, yaw: targetYaw } = lockOnPose(player, target, config, currentFov(state.camera));
      if (!seeded) {
        yaw = targetYaw;
        seeded = true;
      } else {
        yaw = smoothYaw(yaw, targetYaw, config?.yawSmoothing ?? 9, dt);
      }
      env.props.yawRef.current = yaw;
      commit.commit(state.camera, pose, dt);
    },
    dispose() {
      yaw = 0;
      seeded = false;
    },
  };
}

/** Vehicle chase rig that trails behind the followed entity's heading. */
export function chaseRigDraw(getEnv: () => CameraRigEnv): EngineDraw {
  const commit = createCameraCommit(getEnv);
  const staticResolve = memoConfig((config: unknown) => resolveChase(config as ChaseCameraConfig | undefined));
  let state: ChaseRigState | null = null;
  let view: ChaseView | null = null;
  let inputSeeded = false;
  return {
    priority: CAMERA_RIG_FRAME_PRIORITY,
    mount(frameState: EngineFrameState) {
      commit.beginTransition(frameState.camera);
      state = createChaseRigState();
    },
    frame(frameState: EngineFrameState, dt: number) {
      const env = getEnv();
      const followId = resolveFollowId(env.props.followEntityId, env.userId);
      const config = env.props.config?.rigs?.chase as ChaseCameraConfig | undefined;
      const tuning = env.ctx.camera.chaseTuning();
      const merged = tuning === null ? config : { ...config, ...tuning };
      const resolved = tuning === null ? staticResolve(config) : resolveChase(merged);
      const nextView = merged?.view ?? "chase";
      if (view !== nextView) {
        commit.beginTransition(frameState.camera);
        view = nextView;
        if (state !== null) state.offset = null;
      }

      const entity = followId === null ? null : env.ctx.scene.entity.get(followId);
      const follow: Xyz = followId === null || !env.ctx.sim.renderPose(followId, followPose) ? ZERO : { x: followPose[0], y: followPose[1], z: followPose[2] };
      if (!inputSeeded && merged?.headingSource === "input" && nextView === "chase" && (entity !== null || env.props.config?.orbit?.initialYaw !== undefined)) {
        env.props.yawRef.current = resolveChaseHeading(merged, entity?.rotationY ?? 0, undefined, env.props.config?.orbit?.initialYaw);
        inputSeeded = true;
      }
      const turn = env.ctx.camera.takeTurnTo();
      if (turn !== null) env.props.yawRef.current = turn;
      const yaw = resolveChaseHeading(merged, entity?.rotationY ?? 0, env.props.yawRef.current);
      const v = entity?.velocity;
      const published = v !== undefined && (v[0] !== 0 || v[1] !== 0 || v[2] !== 0);
      const lookBack = resolved.lookBackAction !== null && env.ctx.input.isDown(resolved.lookBackAction);
      const clampBoom = resolved.collision
        ? (pivot: Xyz, desired: Xyz) => {
            const dx = desired.x - pivot.x;
            const dy = desired.y - pivot.y;
            const dz = desired.z - pivot.z;
            const length = Math.hypot(dx, dy, dz);
            if (length <= 1e-6) return desired;
            const hit = env.ctx.scene.raycast({
              origin: [pivot.x, pivot.y, pivot.z],
              direction: [dx / length, dy / length, dz / length],
              maxDistance: length + resolved.collisionRadius,
              excludeInstanceIds: followId === null ? undefined : [followId],
              filter: { entities: false },
            });
            return clampBoomToHit(pivot, desired, hit?.distance ?? null, resolved.collisionRadius, resolved.collisionMinDistance);
          }
        : undefined;

      if (state === null) return;
      const step = stepChase(
        state,
        {
          follow,
          yaw,
          bodyPitch: entity?.rotationX ?? 0,
          velocity: published ? { x: v[0], y: v[1], z: v[2] } : null,
          lookBack: lookBack && nextView === "chase",
          fovKick: env.ctx.camera.takeFovKick(),
        },
        resolved,
        dt,
        nextView === "chase" ? clampBoom : undefined,
      );
      env.props.yawRef.current = resolveChaseHeading(merged, step.anchorYaw, env.props.yawRef.current);

      if (nextView !== "chase") {
        const seat =
          nextView === "cockpit"
            ? merged?.seatOffsets?.cockpit ?? { x: 0, y: 1.2, z: 0.1 }
            : nextView === "hood"
              ? merged?.seatOffsets?.hood ?? { x: 0, y: 1, z: 1.4 }
              : merged?.seatOffsets?.rear ?? { x: 0, y: 1.6, z: -1.5 };
        const seatLooksBack = nextView === "rear" || lookBack;
        const pose = seatPose(follow, seatLooksBack ? yaw + Math.PI : yaw, seat, step.pose.fov);
        if (seatLooksBack) pose.position = seatPose(follow, yaw, seat, step.pose.fov).position;
        env.props.yawRef.current = yaw;
        commit.commit(frameState.camera, pose, dt);
        return;
      }

      if (resolved.shakePerSpeed > 0 && step.speed > 0) {
        env.shake.add(Math.min(resolved.shakePerSpeed * step.speed * dt, 0.1));
      }

      commit.commit(frameState.camera, step.pose, dt);
      if (step.roll !== 0) frameState.camera.rotateZ(step.roll);
    },
    dispose() {
      state = null;
      view = null;
      inputSeeded = false;
    },
  };
}

function observerSubject(
  ctx: GameContext,
  config: ObserverCameraConfig | undefined,
  followId: string | null,
): { subject: Xyz; boundEntityId: string | null } {
  const bind = config?.bind ?? (followId !== null ? { kind: "entity" as const, entityId: followId } : undefined);
  if (bind?.kind === "entity") {
    const entity = ctx.scene.entity.get(bind.entityId);
    if (entity !== null) {
      return { subject: { x: entity.position[0], y: entity.position[1], z: entity.position[2] }, boundEntityId: bind.entityId };
    }
    return { subject: { x: 0, y: 0, z: 0 }, boundEntityId: bind.entityId };
  }
  if (bind?.kind === "point") return { subject: { ...bind.position }, boundEntityId: null };
  return { subject: { x: 0, y: 0, z: 0 }, boundEntityId: null };
}

/**
 * Detached spectator/photo cam (#120): binds to any entity or fixed point and
 * auto-orbits it, reading no player input at all â€” the van CCTV / photo-mode /
 * kill-cam rig. Distinct from every other rig, which drives from mouse/keys.
 */
export function observerRigDraw(getEnv: () => CameraRigEnv): EngineDraw {
  const commit = createCameraCommit(getEnv);
  const resolve = memoConfig((config: unknown) => resolveObserver(config as ObserverCameraConfig | undefined));
  let angle = 0;
  return {
    priority: CAMERA_RIG_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      commit.beginTransition(state.camera);
      const env = getEnv();
      const config = env.props.config?.rigs?.observer as ObserverCameraConfig | undefined;
      angle = config?.startAngle ?? 0;
    },
    frame(state: EngineFrameState, dt: number) {
      const env = getEnv();
      const followId = resolveFollowId(env.props.followEntityId, env.userId);
      const config = env.props.config?.rigs?.observer as ObserverCameraConfig | undefined;
      const resolved = resolve(config);
      const bound = observerSubject(env.ctx, config, followId).boundEntityId;
      angle += resolved.orbitSpeed * dt;
      const { subject } = observerSubject(env.ctx, config, followId);
      const pose = observerPose(subject, angle, resolved, config?.fov ?? currentFov(state.camera));
      commit.commit(state.camera, pose, dt, bound);
    },
    dispose() {
      angle = 0;
    },
  };
}

/** Plays a cinematic keyframe path and calls onComplete when it ends. */
export function cinematicRigDraw(getEnv: () => CameraRigEnv): EngineDraw {
  const commit = createCameraCommit(getEnv);
  let elapsed = 0;
  let completed = false;
  let lastCinematic: unknown = UNSET_CONFIG;
  return {
    priority: CAMERA_RIG_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      commit.beginTransition(state.camera);
    },
    update(state: EngineFrameState) {
      const cinematic = getEnv().props.config?.cinematic;
      if (cinematic === lastCinematic) return;
      lastCinematic = cinematic;
      elapsed = 0;
      completed = false;
      commit.beginTransition(state.camera);
    },
    frame(state: EngineFrameState, dt: number) {
      const env = getEnv();
      const cinematic = env.props.config?.cinematic;
      if (cinematic === undefined) return;
      elapsed += dt;
      const sample = cinematicSample(
        cinematic.keyframes,
        elapsed,
        cinematic.loop ?? false,
        currentFov(state.camera),
      );
      const followId = resolveFollowId(env.props.followEntityId, env.userId);
      commit.commit(state.camera, sample.pose, dt, followId);
      if (sample.done && !completed) {
        completed = true;
        env.props.onComplete?.();
      }
    },
    dispose() {
      elapsed = 0;
      completed = false;
      lastCinematic = UNSET_CONFIG;
    },
  };
}

function useRigEnv(props: CameraRigEnv["props"]): { latest: { current: CameraRigEnv } } {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const shake = useCameraShake();
  const playerFov = usePlayerFov();
  const latest = useRef<CameraRigEnv>({ props, ctx, userId, shake, playerFov });
  latest.current = { props, ctx, userId, shake, playerFov };
  return { latest };
}

/** Overhead follow rig at a fixed height and angle. */
export function TopDownRig(props: RigProps) {
  const { latest } = useRigEnv(props);
  useEngineDraw(() => topDownRigDraw(() => latest.current), []);
  return null;
}

/** Fixed side-on 2.5D follow rig: watches the followed entity from the perpendicular axis, never reading WASD/mouse-look. */
export function SideScrollRig(props: RigProps) {
  const { latest } = useRigEnv(props);
  useEngineDraw(() => sideScrollRigDraw(() => latest.current), []);
  return null;
}

/** Strategy rig that pans with keys or screen edges, zooms and rotates over the map. */
export function RtsRig(props: RigProps & { panKeysEnabled?: boolean | undefined; rotateKeysEnabled?: boolean | undefined }) {
  const { latest } = useRigEnv(props);
  useEngineDraw(() => rtsRigDraw(() => latest.current), []);
  return null;
}

/** Over-the-shoulder third-person rig with mouse look and shoulder offset. */
export function ShoulderRig(props: RigProps) {
  const { latest } = useRigEnv(props);
  useEngineDraw(() => shoulderRigDraw(() => latest.current), []);
  return null;
}

/** Rig that frames the player and a locked-on target together. */
export function LockOnRig(props: RigProps) {
  const { latest } = useRigEnv(props);
  useEngineDraw(() => lockOnRigDraw(() => latest.current), []);
  return null;
}

/** Vehicle chase rig that trails behind the followed entity's heading. */
export function ChaseRig(props: RigProps) {
  const { latest } = useRigEnv(props);
  useEngineDraw(() => chaseRigDraw(() => latest.current), []);
  return null;
}

/**
 * Detached spectator/photo cam (#120): binds to any entity or fixed point and
 * auto-orbits it, reading no player input at all â€” the van CCTV / photo-mode /
 * kill-cam rig. Distinct from every other rig, which drives from mouse/keys.
 */
export function ObserverRig(props: RigProps) {
  const { latest } = useRigEnv(props);
  useEngineDraw(() => observerRigDraw(() => latest.current), []);
  return null;
}

/** Plays a cinematic keyframe path and calls onComplete when it ends. */
export function CinematicRig(props: RigProps & { onComplete?: () => void }) {
  const { latest } = useRigEnv(props);
  useEngineDraw(() => cinematicRigDraw(() => latest.current), []);
  return null;
}
