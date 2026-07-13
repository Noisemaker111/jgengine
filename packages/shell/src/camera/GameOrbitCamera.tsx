import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef, type MutableRefObject } from "react";
import { MOUSE, PerspectiveCamera, Raycaster, type Camera, Vector3 } from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";
import {
  cameraLookPitch,
  compensatedFov,
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
import { usePlayerFov } from "./PlayerFov";

type OrbitControlsImpl = NonNullable<ComponentRef<typeof OrbitControls>>;

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
  /** Free the left mouse button for pointer verbs (marquee / click-to-move); orbit moves to the middle button. */
  pointerControls?: boolean;
}

export function GameOrbitCamera({
  yawRef,
  pitchRef,
  config: configPatch,
  followEntityId,
  resolveFollowTarget,
  onDragChange,
  onCameraFollow,
  pointerControls = false,
}: GameOrbitCameraProps) {
  const config = resolveOrbitCameraConfig(configPatch);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const runtimeRef = useRef<OrbitFollowRuntimeState | null>(null);
  const draggingRef = useRef(false);
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const playerFov = usePlayerFov();
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const raycasterRef = useRef(new Raycaster());
  const collisionDirRef = useRef(new Vector3());
  const collisionOriginRef = useRef(new Vector3());
  const followId = followEntityId ?? userId;

  useEffect(() => {
    const entity = ctx.scene.entity.get(followId);
    if (entity === null || runtimeRef.current !== null) return;
    const seeded = seedOrbitFollowState({ entityPosition: entity.position, config });
    runtimeRef.current = seeded;
    camera.position.set(seeded.camera.x, seeded.camera.y, seeded.camera.z);
    camera.lookAt(seeded.target.x, seeded.target.y, seeded.target.z);
  }, [camera, config, ctx, followId]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const entity = ctx.scene.entity.get(followId);
    if (controls === null || entity === null) return;

    if (runtimeRef.current === null) {
      runtimeRef.current = seedOrbitFollowState({ entityPosition: entity.position, config });
      camera.position.set(runtimeRef.current.camera.x, runtimeRef.current.camera.y, runtimeRef.current.camera.z);
      controls.target.set(runtimeRef.current.target.x, runtimeRef.current.target.y, runtimeRef.current.target.z);
    }

    const runtime = runtimeRef.current;
    const previousTarget = runtime.target;
    const desiredTarget = resolveFollowTarget?.(entity) ?? resolveFollowTargetFromPosition(entity.position, config);
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

    let desiredDistance = 0;
    let pulledDistance = 0;
    if (config.collision.enabled) {
      const t = stepped.target;
      const dx = camera.position.x - t.x;
      const dy = camera.position.y - t.y;
      const dz = camera.position.z - t.z;
      const dist = Math.hypot(dx, dy, dz);
      desiredDistance = dist;
      if (dist > config.collision.minTargetDistance) {
        const dir = collisionDirRef.current.set(dx / dist, dy / dist, dz / dist);
        const ray = raycasterRef.current;
        ray.set(collisionOriginRef.current.set(t.x, t.y, t.z), dir);
        ray.near = config.collision.minTargetDistance;
        ray.far = dist;
        let blocked = 0;
        for (const hit of ray.intersectObjects(scene.children, true)) {
          const obj = hit.object;
          if (!obj.visible) continue;
          if ((obj as { isSprite?: boolean }).isSprite === true) continue;
          if (obj.userData.jgCameraTransparent === true) continue;
          blocked = hit.distance;
          break;
        }
        if (blocked > 0) {
          const pulled = Math.max(config.collision.minTargetDistance, blocked - config.collision.padding);
          camera.position.set(t.x + dir.x * pulled, t.y + dir.y * pulled, t.z + dir.z * pulled);
          pulledDistance = pulled;
        }
      }
    }

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
    if ((camera as PerspectiveCamera).isPerspectiveCamera === true) {
      const perspective = camera as PerspectiveCamera;
      const targetFov =
        pulledDistance > 0 && pulledDistance < desiredDistance
          ? compensatedFov(playerFov.fov, desiredDistance, pulledDistance)
          : playerFov.fov;
      if (Math.abs(perspective.fov - targetFov) > 0.001) {
        perspective.fov = targetFov;
        perspective.updateProjectionMatrix();
      }
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
      mouseButtons={
        pointerControls
          ? { LEFT: undefined, MIDDLE: MOUSE.ROTATE, RIGHT: undefined }
          : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: undefined }
      }
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