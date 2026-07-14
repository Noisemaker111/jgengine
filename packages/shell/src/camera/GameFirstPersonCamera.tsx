import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentType, type MutableRefObject } from "react";
import * as THREE from "three";
import type { FirstPersonCameraConfig } from "@jgengine/core/game/playableGame";
import { DEFAULT_EYE_HEIGHT } from "@jgengine/core/combat/shotOrigin";
import type { EntityRenderCues } from "@jgengine/core/combat/renderCues";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";
import { useEntityRenderCues } from "../render/useEntityRenderCues";
import { usePlayerFov } from "./PlayerFov";
import { GAME_SIM_FRAME_PRIORITY, ORBIT_CAMERA_FRAME_PRIORITY } from "./orbitCameraMath";

const DEFAULT_SENSITIVITY = 0.0025;
const DEFAULT_MAX_PITCH = 1.45;

const VIEWMODEL_ORIGIN = new THREE.Vector3(0.34, -0.26, -0.72);
const MUZZLE_TIP_LOCAL = new THREE.Vector3(0, 0.03, -0.61);
const MUZZLE_OFFSET = VIEWMODEL_ORIGIN.clone().add(MUZZLE_TIP_LOCAL);

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
}

export function GameFirstPersonCamera({
  yawRef,
  pitchRef,
  config,
  followEntityId,
  viewmodel,
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

  useFrame(() => {
    const entity = ctx.scene.entity.get(followId);
    if (entity === null) return;
    if (!seededRef.current) {
      seededRef.current = true;
      yawRef.current = entity.rotationY;
    }
    const cosPitch = Math.cos(pitchRef.current);
    camera.position.set(entity.position[0], entity.position[1] + eyeHeight, entity.position[2]);
    camera.lookAt(
      camera.position.x + Math.sin(yawRef.current) * cosPitch,
      camera.position.y + Math.sin(pitchRef.current),
      camera.position.z + Math.cos(yawRef.current) * cosPitch,
    );
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera === true) {
      const perspective = camera as THREE.PerspectiveCamera;
      if (Math.abs(perspective.fov - playerFov.fov) > 0.001) {
        perspective.fov = playerFov.fov;
        perspective.updateProjectionMatrix();
      }
    }
  }, ORBIT_CAMERA_FRAME_PRIORITY);

  if (config?.viewmodel === false) return null;
  return <FirstPersonViewmodel camera={camera} viewmodel={viewmodel} cuesRef={cuesRef} />;
}

function FirstPersonViewmodel({
  camera,
  viewmodel: Viewmodel,
  cuesRef,
}: {
  camera: THREE.Camera;
  viewmodel: ComponentType<ViewmodelProps> | undefined;
  cuesRef: MutableRefObject<EntityRenderCues>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => () => {
    muzzleTracked = false;
  }, []);
  useFrame(() => {
    const group = groupRef.current;
    if (group === null) return;
    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    group.translateX(VIEWMODEL_ORIGIN.x);
    group.translateY(VIEWMODEL_ORIGIN.y);
    group.translateZ(VIEWMODEL_ORIGIN.z);
    muzzleWorld.copy(MUZZLE_OFFSET).applyQuaternion(camera.quaternion).add(camera.position);
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
