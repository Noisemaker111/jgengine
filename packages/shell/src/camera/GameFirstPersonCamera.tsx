import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentType, type MutableRefObject } from "react";
import * as THREE from "three";
import type { CameraWeaponView, FirstPersonCameraConfig } from "@jgengine/core/game/playableGame";
import { DEFAULT_EYE_HEIGHT } from "@jgengine/core/combat/shotOrigin";
import type { EntityRenderCues } from "@jgengine/core/combat/renderCues";
import {
  createWeaponPresentation,
  viewmodelFovScale,
  type WeaponPose,
  type WeaponPresentationTuning,
} from "@jgengine/core/combat/weaponPresentation";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";
import { useEntityRenderCues } from "../render/useEntityRenderCues";
import { usePlayerFov } from "./PlayerFov";
import { GAME_SIM_FRAME_PRIORITY, ORBIT_CAMERA_FRAME_PRIORITY } from "./orbitCameraMath";

const DEFAULT_SENSITIVITY = 0.0025;
const DEFAULT_MAX_PITCH = 1.45;

const VIEWMODEL_ORIGIN = new THREE.Vector3(0.34, -0.26, -0.72);
const MUZZLE_TIP_LOCAL = new THREE.Vector3(0, 0.03, -0.61);

const muzzleWorld = new THREE.Vector3();
let muzzleTracked = false;

/** World position of the first-person weapon muzzle, or false when no viewmodel is mounted. */
export function readFirstPersonMuzzle(target: THREE.Vector3): boolean {
  if (!muzzleTracked) return false;
  target.copy(muzzleWorld);
  return true;
}

/** Props handed to a custom viewmodel component (#542): a live cue ref (velocity/bob/firing/reloading/recoil/hit) for the followed entity, driven from your own `useFrame` — read `cuesRef.current` there rather than storing it as render state. */
export interface ViewmodelProps {
  cuesRef: MutableRefObject<EntityRenderCues>;
}

export interface GameFirstPersonCameraProps {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  config?: FirstPersonCameraConfig;
  followEntityId?: string;
  /** Custom viewmodel component replacing the built-in three-mesh gun, rendered inside the same camera-locked, muzzle-tracked anchor. Ignored when `config.viewmodel === false`. */
  viewmodel?: ComponentType<ViewmodelProps>;
  /** Held-weapon source (`GameCameraConfig.weapon`): poses the viewmodel and adds recoil to the look. */
  weapon?: (entityId: string) => CameraWeaponView | null;
}

export function GameFirstPersonCamera({
  yawRef,
  pitchRef,
  config,
  followEntityId,
  viewmodel,
  weapon,
}: GameFirstPersonCameraProps) {
  const eyeHeight = config?.eyeHeight ?? DEFAULT_EYE_HEIGHT;
  const sensitivity = config?.sensitivity ?? DEFAULT_SENSITIVITY;
  const maxPitch = config?.maxPitch ?? DEFAULT_MAX_PITCH;
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const playerFov = usePlayerFov();
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const followId = followEntityId ?? userId;
  const seededRef = useRef(false);
  const cuesRef = useEntityRenderCues(followId);
  const presentation = useMemo(() => createWeaponPresentation(), []);
  const tuningRef = useRef<WeaponPresentationTuning | undefined>(undefined);
  const lastLookRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const poseRef = useRef<WeaponPose | null>(null);

  useEffect(() => {
    const requestLock = () => {
      if (window.matchMedia?.("(pointer: coarse)").matches) return;
      if (document.pointerLockElement !== domElement) void domElement.requestPointerLock?.();
    };
    const onMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== domElement) return;
      yawRef.current -= event.movementX * sensitivity;
      pitchRef.current = Math.max(
        -maxPitch,
        Math.min(maxPitch, pitchRef.current - event.movementY * sensitivity),
      );
    };
    domElement.addEventListener("click", requestLock);
    window.addEventListener("mousemove", onMove);
    return () => {
      domElement.removeEventListener("click", requestLock);
      window.removeEventListener("mousemove", onMove);
    };
  }, [domElement, sensitivity, maxPitch, yawRef, pitchRef]);

  useFrame((_, dt) => {
    const entity = ctx.scene.entity.get(followId);
    if (entity === null) return;
    if (!seededRef.current) {
      seededRef.current = true;
      yawRef.current = entity.rotationY;
    }
    const view = weapon?.(followId) ?? null;
    const last = (lastLookRef.current ??= { yaw: yawRef.current, pitch: pitchRef.current });
    const step = Math.max(1e-4, dt);
    let pose: WeaponPose | null = null;
    if (view !== null) {
      if (view.presentation !== tuningRef.current) {
        tuningRef.current = view.presentation;
        presentation.retune(view.presentation ?? {});
      }
      pose = presentation.update(dt, {
        lookYawRate: (yawRef.current - last.yaw) / step,
        lookPitchRate: (pitchRef.current - last.pitch) / step,
        speed: cuesRef.current.speed,
        bobPhase: cuesRef.current.bobPhase,
        handling: view.handling,
      });
    }
    last.yaw = yawRef.current;
    last.pitch = pitchRef.current;
    poseRef.current = pose;
    const yaw = yawRef.current - (pose?.lookYaw ?? 0);
    const pitch = Math.max(-maxPitch, Math.min(maxPitch, pitchRef.current + (pose?.lookPitch ?? 0)));
    const cosPitch = Math.cos(pitch);
    camera.position.set(entity.position[0], entity.position[1] + eyeHeight, entity.position[2]);
    camera.lookAt(
      camera.position.x + Math.sin(yaw) * cosPitch,
      camera.position.y + Math.sin(pitch),
      camera.position.z + Math.cos(yaw) * cosPitch,
    );
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera === true) {
      const perspective = camera as THREE.PerspectiveCamera;
      const fov = playerFov.fov * (pose?.fovScale ?? 1);
      if (Math.abs(perspective.fov - fov) > 0.001) {
        perspective.fov = fov;
        perspective.updateProjectionMatrix();
      }
    }
  }, ORBIT_CAMERA_FRAME_PRIORITY);

  if (config?.viewmodel === false) return null;
  return <FirstPersonViewmodel camera={camera} viewmodel={viewmodel} cuesRef={cuesRef} poseRef={poseRef} />;
}

function FirstPersonViewmodel({
  camera,
  viewmodel: Viewmodel,
  cuesRef,
  poseRef,
}: {
  camera: THREE.Camera;
  viewmodel: ComponentType<ViewmodelProps> | undefined;
  cuesRef: MutableRefObject<EntityRenderCues>;
  poseRef: MutableRefObject<WeaponPose | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => () => {
    muzzleTracked = false;
  }, []);
  useFrame(() => {
    const group = groupRef.current;
    if (group === null) return;
    const pose = poseRef.current;
    const perspective = camera as THREE.PerspectiveCamera;
    // Scaling camera-space x/y by this projects the viewmodel at its own FOV without a second render pass.
    const squash =
      pose?.viewmodelFov == null || perspective.isPerspectiveCamera !== true ? 1 : viewmodelFovScale(perspective.fov, pose.viewmodelFov);
    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    group.translateX((pose?.offset[0] ?? VIEWMODEL_ORIGIN.x) * squash);
    group.translateY((pose?.offset[1] ?? VIEWMODEL_ORIGIN.y) * squash);
    group.translateZ(pose?.offset[2] ?? VIEWMODEL_ORIGIN.z);
    group.rotateX(pose?.pitch ?? 0);
    group.rotateY(pose?.yaw ?? 0);
    group.rotateZ(pose?.roll ?? 0);
    group.scale.set(squash, squash, 1);
    group.updateMatrixWorld();
    group.localToWorld(muzzleWorld.copy(MUZZLE_TIP_LOCAL));
    muzzleTracked = true;
  }, GAME_SIM_FRAME_PRIORITY);
  if (Viewmodel !== undefined) {
    return (
      <group ref={groupRef}>
        <Viewmodel cuesRef={cuesRef} />
      </group>
    );
  }
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, -0.22]}>
        <boxGeometry args={[0.09, 0.11, 0.55]} />
        <meshStandardMaterial color="#22262d" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.13, 0.04]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.08, 0.18, 0.11]} />
        <meshStandardMaterial color="#33373f" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.03, -0.52]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.18, 10]} />
        <meshStandardMaterial color="#0e0f12" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}
