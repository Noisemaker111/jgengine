import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { FirstPersonCameraConfig } from "@jgengine/core/game/playableGame";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";
import { GAME_SIM_FRAME_PRIORITY, ORBIT_CAMERA_FRAME_PRIORITY } from "./orbitCameraMath";

const DEFAULT_EYE_HEIGHT = 1.6;
const DEFAULT_SENSITIVITY = 0.0025;
const DEFAULT_MAX_PITCH = 1.45;

export interface GameFirstPersonCameraProps {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  config?: FirstPersonCameraConfig;
  followEntityId?: string;
}

export function GameFirstPersonCamera({
  yawRef,
  pitchRef,
  config,
  followEntityId,
}: GameFirstPersonCameraProps) {
  const eyeHeight = config?.eyeHeight ?? DEFAULT_EYE_HEIGHT;
  const sensitivity = config?.sensitivity ?? DEFAULT_SENSITIVITY;
  const maxPitch = config?.maxPitch ?? DEFAULT_MAX_PITCH;
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const followId = followEntityId ?? userId;

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
    const cosPitch = Math.cos(pitchRef.current);
    camera.position.set(entity.position[0], entity.position[1] + eyeHeight, entity.position[2]);
    camera.lookAt(
      camera.position.x + Math.sin(yawRef.current) * cosPitch,
      camera.position.y + Math.sin(pitchRef.current),
      camera.position.z + Math.cos(yawRef.current) * cosPitch,
    );
  }, ORBIT_CAMERA_FRAME_PRIORITY);

  if (config?.viewmodel === false) return null;
  return <FirstPersonViewmodel camera={camera} />;
}

function FirstPersonViewmodel({ camera }: { camera: THREE.Camera }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const group = groupRef.current;
    if (group === null) return;
    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    group.translateX(0.34);
    group.translateY(-0.26);
    group.translateZ(-0.72);
  }, GAME_SIM_FRAME_PRIORITY);
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
