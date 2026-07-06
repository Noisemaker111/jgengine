import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import { MOUSE, type Camera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";
import {
  cameraLookPitch,
  ORBIT_CAMERA_FRAME_PRIORITY,
  orbitFollowStep,
  orbitYawFromCamera,
  resolveFollowTargetFromPosition,
  resolveOrbitCameraConfig,
  seedOrbitFollowState,
  type CameraFollowState,
  type OrbitCameraConfig,
  type OrbitFollowRuntimeState,
  type Vec3,
} from "./orbitCameraMath";

export type CameraFollowListener = (state: CameraFollowState) => void;

export interface GameOrbitCameraProps {
  yawRef: MutableRefObject<number>;
  /** Written each frame with the camera's look elevation (radians) for aim.pitch. */
  pitchRef?: MutableRefObject<number>;
  config?: Partial<OrbitCameraConfig>;
  followEntityId?: string;
  /** Override orbit target derived from the followed entity. */
  resolveFollowTarget?: (entity: SceneEntity) => Vec3;
  onDragChange?: (dragging: boolean) => void;
  onCameraFollow?: CameraFollowListener;
  groundHeightAt?: (x: number, z: number) => number;
}

export function GameOrbitCamera({
  yawRef,
  pitchRef,
  config: configPatch,
  followEntityId,
  resolveFollowTarget,
  onDragChange,
  onCameraFollow,
  groundHeightAt,
}: GameOrbitCameraProps) {
  const config = resolveOrbitCameraConfig(configPatch);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const runtimeRef = useRef<OrbitFollowRuntimeState | null>(null);
  const draggingRef = useRef(false);
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const followId = followEntityId ?? userId;
  const groundedPosition = (
    position: readonly [number, number, number],
  ): readonly [number, number, number] => [
    position[0],
    position[1] + (groundHeightAt?.(position[0], position[2]) ?? 0),
    position[2],
  ];

  useEffect(() => {
    const entity = ctx.scene.entity.get(followId);
    if (entity === null || runtimeRef.current !== null) return;
    const seeded = seedOrbitFollowState({ entityPosition: groundedPosition(entity.position), config });
    runtimeRef.current = seeded;
    camera.position.set(seeded.camera.x, seeded.camera.y, seeded.camera.z);
    camera.lookAt(seeded.target.x, seeded.target.y, seeded.target.z);
  }, [camera, config, ctx, followId]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const entity = ctx.scene.entity.get(followId);
    if (controls === null || entity === null) return;

    if (runtimeRef.current === null) {
      runtimeRef.current = seedOrbitFollowState({ entityPosition: groundedPosition(entity.position), config });
      camera.position.set(runtimeRef.current.camera.x, runtimeRef.current.camera.y, runtimeRef.current.camera.z);
      controls.target.set(runtimeRef.current.target.x, runtimeRef.current.target.y, runtimeRef.current.target.z);
    }

    const runtime = runtimeRef.current;
    const previousTarget = runtime.target;
    const desiredTarget =
      resolveFollowTarget?.(entity) ?? resolveFollowTargetFromPosition(groundedPosition(entity.position), config);
    const stepped = orbitFollowStep({
      state: runtime,
      desiredTarget,
      deltaSeconds: delta,
      config,
      dragging: draggingRef.current,
    });

    controls.target.set(stepped.target.x, stepped.target.y, stepped.target.z);

    if (draggingRef.current) {
      camera.position.x += stepped.target.x - previousTarget.x;
      camera.position.y += stepped.target.y - previousTarget.y;
      camera.position.z += stepped.target.z - previousTarget.z;
    } else {
      camera.position.set(stepped.camera.x, stepped.camera.y, stepped.camera.z);
    }

    controls.update();

    runtimeRef.current = {
      target: stepped.target,
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      lockedDistance: draggingRef.current ? controls.getDistance() : stepped.lockedDistance,
    };

    const [px, , pz] = entity.position;
    yawRef.current = orbitYawFromCamera(camera.position.x, camera.position.z, px, pz);
    if (pitchRef !== undefined) {
      pitchRef.current = cameraLookPitch(
        { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        stepped.target,
      );
    }
    onCameraFollow?.({
      entityId: followId,
      target: stepped.target,
      camera: runtimeRef.current.camera,
      distance: runtimeRef.current.lockedDistance ?? stepped.distance,
    });
  }, ORBIT_CAMERA_FRAME_PRIORITY);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={config.dampingFactor}
      rotateSpeed={config.rotateSpeed}
      zoomSpeed={config.zoomSpeed}
      enablePan={false}
      enableRotate
      enableZoom
      minDistance={config.minDistance}
      maxDistance={config.maxDistance}
      maxPolarAngle={config.maxPolarAngle}
      minPolarAngle={config.minPolarAngle}
      screenSpacePanning={false}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: undefined }}
      onStart={() => {
        draggingRef.current = true;
        onDragChange?.(true);
      }}
      onEnd={() => {
        draggingRef.current = false;
        onDragChange?.(false);
        if (controlsRef.current !== null && runtimeRef.current !== null) {
          runtimeRef.current.lockedDistance = controlsRef.current.getDistance();
        }
      }}
    />
  );
}

/** Seed orbit target before controls mount (demo spawn at origin). */
export function seedOrbitCameraTarget(camera: Camera, target: Vector3, distance: number, height: number): void {
  camera.position.set(target.x, height, target.z - distance);
  camera.lookAt(target);
}