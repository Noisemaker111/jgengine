import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
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
} from "@jgengine/core/game/playableGame";
import { snapPixelPerfectPosition } from "@jgengine/core/game/pixelPerfect";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { usePlayer } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { ORBIT_CAMERA_FRAME_PRIORITY, type Vec3 } from "./orbitCameraMath";
import {
  cinematicSample,
  clamp,
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
  seatPose,
  shoulderPose,
  sideScrollFollowBlend,
  smoothYaw,
  stepChase,
  topDownPose,
  type CameraPose,
  type ChaseRigState,
} from "./rigMath";
import { usePlayerFov } from "./PlayerFov";
import { useCameraShake } from "./shakeChannel";
import {
  applyCameraBlendStep,
  captureCameraBlendFrom,
  createCameraBlendScratch,
} from "./cameraBlendMath";

export {
  applyCameraBlendStep,
  captureCameraBlendFrom,
  createCameraBlendScratch,
  type CameraBlendScratch,
} from "./cameraBlendMath";

export const CAMERA_RIG_FRAME_PRIORITY = ORBIT_CAMERA_FRAME_PRIORITY;
export const CAMERA_POST_FRAME_PRIORITY = ORBIT_CAMERA_FRAME_PRIORITY + 0.5;

export interface RigProps {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  config?: GameCameraConfig;
  followEntityId?: string | null;
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
  pos: Vec3;
  yaw: number;
}

function readFollow(ctx: GameContext, followId: string | null): FollowSample | null {
  if (followId === null) return null;
  const entity = ctx.scene.entity.get(followId);
  if (entity === null) return null;
  return {
    pos: { x: entity.position[0], y: entity.position[1], z: entity.position[2] },
    yaw: entity.rotationY,
  };
}

/**
 * Shared per-frame finalizer every rig funnels through: applies the crossfade
 * blend captured on a rig swap, layers the trauma-channel shake, advances the
 * shake clock, and reports `onCameraFollow`. Rigs compute a clean pose; this
 * hook owns shake + transitions so they behave identically across rigs.
 */
function useCameraCommit(props: RigProps, followId: string | null) {
  const camera = useThree((state) => state.camera);
  const shake = useCameraShake();
  const playerFov = usePlayerFov();
  const shakeConfig = props.config?.shake;
  const transitionSeconds = props.config?.transitionSeconds ?? 0.6;
  const blendScratchRef = useRef(createCameraBlendScratch(Vector3, Quaternion));
  const blendingRef = useRef(false);
  const lastPoseRef = useRef<CameraPose | null>(null);
  const farWarnedRef = useRef(false);

  const beginTransition = () => {
    if (transitionSeconds <= 0) return;
    captureCameraBlendFrom(
      blendScratchRef.current,
      camera.position,
      camera.quaternion,
      currentFov(camera),
      transitionSeconds,
    );
    blendingRef.current = true;
  };

  const commit = (pose: CameraPose, dt: number) => {
    const composed: CameraPose = {
      ...pose,
      fov: playerFov.compose(pose.fov, props.absoluteFov === true ? "absolute" : "relative"),
    };
    lastPoseRef.current = composed;
    applyPose(camera, composed);

    const lookDistance = Math.hypot(
      pose.position.x - pose.lookAt.x,
      pose.position.y - pose.lookAt.y,
      pose.position.z - pose.lookAt.z,
    );
    if (!farWarnedRef.current && isPerspective(camera) && lookDistance > camera.far) {
      farWarnedRef.current = true;
      console.warn(
        `[jgengine:camera] the "${props.config?.rig ?? "orbit"}" rig placed the camera ${Math.round(lookDistance)} world units from its look target, beyond the far plane (${camera.far}) — everything near the target is frustum-culled and the world renders empty. Check the rig config (topDown pitch is elevation: PI/2 = straight down, near 0 = grazing) or raise camera.frustum.far.`,
      );
    }

    if (blendingRef.current) {
      const done = applyCameraBlendStep(blendScratchRef.current, camera, composed.fov, dt);
      if (done) blendingRef.current = false;
    }

    shake.step(dt);
    const offset = shake.sample(shakeConfig);
    if (offset.x !== 0 || offset.y !== 0 || offset.roll !== 0) {
      camera.translateX(offset.x);
      camera.translateY(offset.y);
      camera.rotateZ(offset.roll);
    }

    props.config?.onCameraFollow?.({
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

  return { camera, commit, beginTransition };
}

function useWheelZoom(initial: number, min: number, max: number, speed: number): MutableRefObject<number> {
  const domElement = useThree((state) => state.gl.domElement);
  const zoomRef = useRef(initial);
  useEffect(() => {
    zoomRef.current = initial;
  }, [initial]);
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (event.shiftKey) return;
      zoomRef.current = clamp(zoomRef.current + Math.sign(event.deltaY) * speed, min, max);
    };
    domElement.addEventListener("wheel", onWheel, { passive: true });
    return () => domElement.removeEventListener("wheel", onWheel);
  }, [domElement, min, max, speed]);
  return zoomRef;
}

export function TopDownRig(props: RigProps) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const followId = resolveFollowId(props.followEntityId, userId);
  const config = props.config?.topDown;
  const resolved = useMemo(() => resolveTopDown(config), [config]);
  const { camera, commit, beginTransition } = useCameraCommit(props, followId);
  const followRef = useRef<Vec3 | null>(null);
  const zoomRef = useWheelZoom(
    resolved.height,
    (config?.zoom?.min ?? 0.6) * resolved.height,
    (config?.zoom?.max ?? 1.8) * resolved.height,
    config?.zoom?.speed ?? resolved.height * 0.08,
  );

  useEffect(beginTransition, []);

  useFrame((_, dt) => {
    const sample = readFollow(ctx, followId);
    const desired = sample?.pos ?? { x: 0, y: 0, z: 0 };
    const prev = followRef.current ?? desired;
    const blend = 1 - Math.exp(-resolved.followSmoothing * dt);
    const follow: Vec3 = {
      x: prev.x + (desired.x - prev.x) * blend,
      y: prev.y + (desired.y - prev.y) * blend,
      z: prev.z + (desired.z - prev.z) * blend,
    };
    followRef.current = follow;
    props.yawRef.current = resolved.yaw;
    const pose = topDownPose(follow, { ...resolved, height: zoomRef.current }, currentFov(camera));
    commit(pose, dt);
  }, CAMERA_RIG_FRAME_PRIORITY);

  return null;
}

/** Fixed side-on 2.5D follow rig: watches the followed entity from the perpendicular axis, never reading WASD/mouse-look. */
export function SideScrollRig(props: RigProps) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const followId = resolveFollowId(props.followEntityId, userId);
  const config: SideScrollCameraConfig | undefined = props.config?.sideScroll;
  const resolved = useMemo(() => resolveSideScroll(config), [config]);
  const { camera, commit, beginTransition } = useCameraCommit(props, followId);
  const followRef = useRef<Vec3 | null>(null);

  useEffect(beginTransition, []);

  useFrame((_, dt) => {
    const sample = readFollow(ctx, followId);
    const desired = sample?.pos ?? { x: 0, y: 0, z: 0 };
    const prev = followRef.current ?? desired;
    const blend = sideScrollFollowBlend(resolved.followSmoothing, dt);
    const follow: Vec3 = {
      x: prev.x + (desired.x - prev.x) * blend,
      y: prev.y + (desired.y - prev.y) * blend,
      z: prev.z + (desired.z - prev.z) * blend,
    };
    followRef.current = follow;
    const pose = resolveSideScrollPose(follow, resolved, config?.fov ?? currentFov(camera));
    const pixelPerfect = props.config?.projection === "orthographic" ? props.config.pixelPerfect : undefined;
    if (pixelPerfect !== undefined) {
      const snapped = snapPixelPerfectPosition(pose.position, pixelPerfect.pixelsPerUnit);
      pose.position = snapped;
      pose.lookAt = snapPixelPerfectPosition(pose.lookAt, pixelPerfect.pixelsPerUnit);
    }
    commit(pose, dt);
  }, CAMERA_RIG_FRAME_PRIORITY);

  return null;
}

function useHeldKeys(codes: readonly string[]): MutableRefObject<Set<string>> {
  const held = useRef<Set<string>>(new Set());
  useEffect(() => {
    const set = new Set(codes);
    const down = (event: KeyboardEvent) => {
      if (set.has(event.code)) held.current.add(event.code);
    };
    const up = (event: KeyboardEvent) => {
      held.current.delete(event.code);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      held.current.clear();
    };
  }, [codes.join(",")]);
  return held;
}

const RTS_PAN_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyQ", "KeyE"];
const RTS_WASD_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

export function RtsRig(props: RigProps & { panKeysEnabled?: boolean }) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const followId = resolveFollowId(props.followEntityId, userId);
  const config: RtsCameraConfig | undefined = props.config?.rts;
  const resolved = useMemo(() => resolveTopDown(config), [config]);
  const { camera, commit, beginTransition } = useCameraCommit(props, followId);
  const wasdPanEnabled = followId === null && props.panKeysEnabled !== false;
  const heldCodes = useMemo(
    () => (wasdPanEnabled ? RTS_PAN_KEYS : RTS_PAN_KEYS.filter((code) => !RTS_WASD_KEYS.has(code))),
    [wasdPanEnabled],
  );
  const held = useHeldKeys(heldCodes);
  const centerRef = useRef<Vec3>({
    x: config?.start?.x ?? 0,
    y: 0,
    z: config?.start?.z ?? 0,
  });
  const yawRef = useRef(resolved.yaw);
  const pointerRef = useRef<{ nx: number; ny: number } | null>(null);
  const domElement = useThree((state) => state.gl.domElement);
  const zoomRef = useWheelZoom(
    resolved.height,
    (config?.zoom?.min ?? 0.5) * resolved.height,
    (config?.zoom?.max ?? 2.2) * resolved.height,
    config?.zoom?.speed ?? resolved.height * 0.09,
  );

  const edgeScroll = config?.edgeScroll ?? true;
  const edgeMargin = typeof edgeScroll === "object" ? edgeScroll.margin ?? 0.04 : 0.04;
  const panSpeed = config?.panSpeed ?? 24;
  const rotateSpeed = config?.rotateSpeed ?? 1.4;

  useEffect(beginTransition, []);

  useEffect(() => {
    if (edgeScroll === false) return;
    const onMove = (event: PointerEvent) => {
      const rect = domElement.getBoundingClientRect();
      pointerRef.current = {
        nx: (event.clientX - rect.left) / rect.width,
        ny: (event.clientY - rect.top) / rect.height,
      };
    };
    const onLeave = () => {
      pointerRef.current = null;
    };
    domElement.addEventListener("pointermove", onMove);
    domElement.addEventListener("pointerleave", onLeave);
    return () => {
      domElement.removeEventListener("pointermove", onMove);
      domElement.removeEventListener("pointerleave", onLeave);
    };
  }, [domElement, edgeScroll]);

  useFrame((_, dt) => {
    const keys = held.current;
    if (keys.has("KeyQ")) yawRef.current += rotateSpeed * dt;
    if (keys.has("KeyE")) yawRef.current -= rotateSpeed * dt;

    let panX = 0;
    let panZ = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) panZ += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) panZ -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) panX += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) panX -= 1;

    const pointer = pointerRef.current;
    if (edgeScroll !== false && pointer !== null) {
      if (pointer.nx < edgeMargin) panX -= 1;
      else if (pointer.nx > 1 - edgeMargin) panX += 1;
      if (pointer.ny < edgeMargin) panZ += 1;
      else if (pointer.ny > 1 - edgeMargin) panZ -= 1;
    }

    const center = centerRef.current;
    if (panX !== 0 || panZ !== 0) {
      const dir = rtsPanWorldDir(panX, panZ, yawRef.current);
      center.x += dir.x * panSpeed * dt;
      center.z += dir.z * panSpeed * dt;
    } else {
      const follow = readFollow(ctx, followId);
      if (follow !== null) {
        center.x += (follow.pos.x - center.x) * (1 - Math.exp(-resolved.followSmoothing * dt));
        center.z += (follow.pos.z - center.z) * (1 - Math.exp(-resolved.followSmoothing * dt));
      }
    }

    const bounds = config?.bounds;
    if (bounds !== undefined) {
      center.x = clamp(center.x, bounds.minX ?? -Infinity, bounds.maxX ?? Infinity);
      center.z = clamp(center.z, bounds.minZ ?? -Infinity, bounds.maxZ ?? Infinity);
    }

    props.yawRef.current = yawRef.current;
    const pose = topDownPose(
      center,
      { ...resolved, yaw: yawRef.current, height: zoomRef.current },
      currentFov(camera),
    );
    commit(pose, dt);
  }, CAMERA_RIG_FRAME_PRIORITY);

  return null;
}

export function ShoulderRig(props: RigProps) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const followId = resolveFollowId(props.followEntityId, userId);
  const config: ShoulderCameraConfig | undefined = props.config?.shoulder;
  const { commit, beginTransition } = useCameraCommit(props, followId);
  const domElement = useThree((state) => state.gl.domElement);
  const sideRef = useRef(config?.side === "left" ? -1 : 1);
  const aimRef = useRef(0);
  const aimingRef = useRef(false);
  const sensitivity = config?.sensitivity ?? 0.0025;

  useEffect(beginTransition, []);

  useEffect(() => {
    const requestLock = () => {
      if (document.pointerLockElement !== domElement) void domElement.requestPointerLock?.();
    };
    const onMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== domElement) return;
      props.yawRef.current -= event.movementX * sensitivity;
      props.pitchRef.current = clamp(props.pitchRef.current - event.movementY * sensitivity, -1.2, 1.2);
    };
    const onDown = (event: MouseEvent) => {
      if (event.button === 2) aimingRef.current = true;
    };
    const onUp = (event: MouseEvent) => {
      if (event.button === 2) aimingRef.current = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "KeyV") sideRef.current *= -1;
    };
    const onContext = (event: Event) => event.preventDefault();
    domElement.addEventListener("click", requestLock);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    domElement.addEventListener("contextmenu", onContext);
    return () => {
      domElement.removeEventListener("click", requestLock);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      domElement.removeEventListener("contextmenu", onContext);
    };
  }, [domElement, sensitivity, props.yawRef, props.pitchRef]);

  useFrame((_, dt) => {
    const sample = readFollow(ctx, followId);
    const follow = sample?.pos ?? { x: 0, y: 0, z: 0 };
    const weapon = followId === null ? null : (props.config?.weapon?.(followId) ?? null);
    if (weapon === null) {
      const adsTarget = aimingRef.current ? 1 : 0;
      aimRef.current += (adsTarget - aimRef.current) * (1 - Math.exp(-(config?.adsTransitionSpeed ?? 10) * dt));
    } else aimRef.current = weapon.handling.adsProgress;
    const hip = resolveShoulder(config, false);
    const ads = resolveShoulder(config, true);
    const blended = {
      shoulderOffset: hip.shoulderOffset + (ads.shoulderOffset - hip.shoulderOffset) * aimRef.current,
      heightOffset: hip.heightOffset + (ads.heightOffset - hip.heightOffset) * aimRef.current,
      distance: hip.distance + (ads.distance - hip.distance) * aimRef.current,
      fov: hip.fov + (ads.fov - hip.fov) * aimRef.current,
    };
    const handling = weapon?.handling;
    const yaw = props.yawRef.current - (handling === undefined ? 0 : handling.aimYaw + handling.cameraYaw);
    // This rig's pitch is camera elevation, so a muzzle climb lowers it.
    const pitch = props.pitchRef.current - (handling === undefined ? 0 : handling.aimPitch + handling.cameraPitch);
    const pose = shoulderPose(follow, yaw, pitch, sideRef.current, blended);
    commit(pose, dt);
  }, CAMERA_RIG_FRAME_PRIORITY);

  return null;
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

export function LockOnRig(props: RigProps) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const followId = resolveFollowId(props.followEntityId, userId);
  const config: LockOnCameraConfig | undefined = props.config?.lockOn;
  const { camera, commit, beginTransition } = useCameraCommit(props, followId);
  const yawRef = useRef(0);
  const seeded = useRef(false);

  useEffect(beginTransition, []);

  useFrame((_, dt) => {
    const sample = readFollow(ctx, followId);
    const player = sample?.pos ?? { x: 0, y: 0, z: 0 };
    const targetId = pickLockTarget(ctx, followId, config);
    const targetEntity = targetId === null ? null : ctx.scene.entity.get(targetId);
    const target: Vec3 = targetEntity === null
      ? { x: player.x, y: player.y, z: player.z + 1 }
      : { x: targetEntity.position[0], y: targetEntity.position[1], z: targetEntity.position[2] };

    const { pose, yaw } = lockOnPose(player, target, config, currentFov(camera));
    if (!seeded.current) {
      yawRef.current = yaw;
      seeded.current = true;
    } else {
      yawRef.current = smoothYaw(yawRef.current, yaw, config?.yawSmoothing ?? 9, dt);
    }
    props.yawRef.current = yawRef.current;
    commit(pose, dt);
  }, CAMERA_RIG_FRAME_PRIORITY);

  return null;
}

export function ChaseRig(props: RigProps) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const followId = resolveFollowId(props.followEntityId, userId);
  const config: ChaseCameraConfig | undefined = props.config?.chase;
  const staticResolved = useMemo(() => resolveChase(config), [config]);
  const { camera, commit, beginTransition } = useCameraCommit(props, followId);
  const shake = useCameraShake();
  const stateRef = useRef<ChaseRigState>(createChaseRigState());
  const viewRef = useRef<ChaseView | null>(null);

  useFrame((_, dt) => {
    const tuning = ctx.camera.chaseTuning();
    const merged = tuning === null ? config : { ...config, ...tuning };
    const resolved = tuning === null ? staticResolved : resolveChase(merged);
    const view = merged?.view ?? "chase";
    if (viewRef.current !== view) {
      beginTransition();
      viewRef.current = view;
      stateRef.current.offset = null;
    }

    const entity = followId === null ? null : ctx.scene.entity.get(followId);
    const follow: Vec3 = entity === null ? { x: 0, y: 0, z: 0 } : { x: entity.position[0], y: entity.position[1], z: entity.position[2] };
    const yaw = entity?.rotationY ?? 0;
    const v = entity?.velocity;
    const published = v !== undefined && (v[0] !== 0 || v[1] !== 0 || v[2] !== 0);
    const lookBack = resolved.lookBackAction !== null && ctx.input.isDown(resolved.lookBackAction);
    const clampBoom = resolved.collision
      ? (pivot: Vec3, desired: Vec3) => {
          const dx = desired.x - pivot.x;
          const dy = desired.y - pivot.y;
          const dz = desired.z - pivot.z;
          const length = Math.hypot(dx, dy, dz);
          if (length <= 1e-6) return desired;
          const hit = ctx.scene.raycast({
            origin: [pivot.x, pivot.y, pivot.z],
            direction: [dx / length, dy / length, dz / length],
            maxDistance: length + resolved.collisionRadius,
            excludeInstanceIds: followId === null ? undefined : [followId],
            filter: { entities: false },
          });
          return clampBoomToHit(pivot, desired, hit?.distance ?? null, resolved.collisionRadius, resolved.collisionMinDistance);
        }
      : undefined;

    const step = stepChase(
      stateRef.current,
      {
        follow,
        yaw,
        bodyPitch: entity?.rotationX ?? 0,
        velocity: published ? { x: v[0], y: v[1], z: v[2] } : null,
        lookBack: lookBack && view === "chase",
        fovKick: ctx.camera.takeFovKick(),
      },
      resolved,
      dt,
      view === "chase" ? clampBoom : undefined,
    );
    props.yawRef.current = step.anchorYaw;

    if (view !== "chase") {
      const seat =
        view === "cockpit"
          ? merged?.seatOffsets?.cockpit ?? { x: 0, y: 1.2, z: 0.1 }
          : view === "hood"
            ? merged?.seatOffsets?.hood ?? { x: 0, y: 1, z: 1.4 }
            : merged?.seatOffsets?.rear ?? { x: 0, y: 1.6, z: -1.5 };
      const seatLooksBack = view === "rear" || lookBack;
      const pose = seatPose(follow, seatLooksBack ? yaw + Math.PI : yaw, seat, step.pose.fov);
      if (seatLooksBack) pose.position = seatPose(follow, yaw, seat, step.pose.fov).position;
      props.yawRef.current = yaw;
      commit(pose, dt);
      return;
    }

    if (resolved.shakePerSpeed > 0 && step.speed > 0) {
      shake.shake(Math.min(resolved.shakePerSpeed * step.speed * dt, 0.1));
    }

    commit(step.pose, dt);
    if (step.roll !== 0) camera.rotateZ(step.roll);
  }, CAMERA_RIG_FRAME_PRIORITY);

  return null;
}

function observerSubject(
  ctx: GameContext,
  config: ObserverCameraConfig | undefined,
  followId: string | null,
): { subject: Vec3; boundEntityId: string | null } {
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
 * auto-orbits it, reading no player input at all — the van CCTV / photo-mode /
 * kill-cam rig. Distinct from every other rig, which drives from mouse/keys.
 */
export function ObserverRig(props: RigProps) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const config: ObserverCameraConfig | undefined = props.config?.observer;
  const followId = resolveFollowId(props.followEntityId, userId);
  const resolved = useMemo(() => resolveObserver(config), [config]);
  const angleRef = useRef(config?.startAngle ?? 0);
  const { camera, commit, beginTransition } = useCameraCommit(
    props,
    observerSubject(ctx, config, followId).boundEntityId,
  );

  useEffect(beginTransition, []);

  useFrame((_, dt) => {
    angleRef.current += resolved.orbitSpeed * dt;
    const { subject } = observerSubject(ctx, config, followId);
    const pose = observerPose(subject, angleRef.current, resolved, config?.fov ?? currentFov(camera));
    commit(pose, dt);
  }, CAMERA_RIG_FRAME_PRIORITY);

  return null;
}

export function CinematicRig(props: RigProps & { onComplete?: () => void }) {
  const { userId } = usePlayer();
  const followId = resolveFollowId(props.followEntityId, userId);
  const cinematic = props.config?.cinematic;
  const { camera, commit, beginTransition } = useCameraCommit(props, followId);
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(props.onComplete);
  onCompleteRef.current = props.onComplete;

  useEffect(() => {
    elapsedRef.current = 0;
    completedRef.current = false;
    beginTransition();
  }, [cinematic]);

  useFrame((_, dt) => {
    if (cinematic === undefined) return;
    elapsedRef.current += dt;
    const sample = cinematicSample(
      cinematic.keyframes,
      elapsedRef.current,
      cinematic.loop ?? false,
      currentFov(camera),
    );
    commit(sample.pose, dt);
    if (sample.done && !completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current?.();
    }
  }, CAMERA_RIG_FRAME_PRIORITY);

  return null;
}
