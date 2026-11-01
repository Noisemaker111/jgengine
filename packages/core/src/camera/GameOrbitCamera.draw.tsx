import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type ComponentRef, type MutableRefObject } from "react";
import { MOUSE, PerspectiveCamera, Raycaster, type Camera, Vector3 } from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { isCameraOccluderTransparent } from "./cameraCollision";
import { useGameContext } from "@jgengine/react/provider";
import type { RenderPose } from "@jgengine/core/runtime/poseInterpolation";
import { usePlayer } from "@jgengine/react/hooks";
import {
  cameraLookPitch,
  compensatedFov,
  ORBIT_CAMERA_FRAME_PRIORITY,
  orbitFollowStep,
  orbitTurnTo,
  orbitYawFromCamera,
  resolveFollowTargetFromPosition,
  resolveOrbitCameraConfig,
  seedOrbitFollowState,
  type OrbitCameraConfig,
  type OrbitFollowRuntimeState,
} from "./orbitCameraMath";
import { usePlayerFov } from "./PlayerFov.draw";
import type { Xyz } from "@jgengine/core/math/xyz";
import type { CameraFollowState } from "@jgengine/core/camera/cameraConfig";

const drawnPose: RenderPose = [0, 0, 0, 0];
const drawnPosition: [number, number, number] = [0, 0, 0];
function fillDrawn(pose: RenderPose): readonly [number, number, number] {
  drawnPosition[0] = pose[0];
  drawnPosition[1] = pose[1];
  drawnPosition[2] = pose[2];
  return drawnPosition;
}

type OrbitControlsImpl = NonNullable<ComponentRef<typeof OrbitControls>>;


/**
 * Mouse mapping for the orbit rig. Right-drag always orbits; left-drag orbits too unless the game uses the
 * left button for picking (`pointerControls`), where the middle button also orbits.
 * @internal
 */
export function orbitMouseButtons(pointerControls: boolean): { LEFT?: MOUSE; MIDDLE?: MOUSE; RIGHT?: MOUSE } {
  // Leaving LEFT out frees the left button for pointer controls (the prop replaces the whole map).
  return pointerControls
    ? { MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.ROTATE }
    : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
}

/** Callback that receives the orbit camera's follow state every frame. */
export type CameraFollowListener = (state: CameraFollowState) => void;

/** Props for GameOrbitCamera: yaw/pitch refs, orbit config patch, followed entity and follow-target overrides. */
export interface GameOrbitCameraProps {
  yawRef: MutableRefObject<number>;
  /** Written each frame with the camera's look elevation (radians) for aim.pitch. */
  pitchRef?: MutableRefObject<number>;
  config?: Partial<OrbitCameraConfig> | undefined;
  followEntityId?: string | undefined;
  /** Override orbit target derived from the followed entity. */
  resolveFollowTarget?: (entity: SceneEntity) => Xyz;
  onDragChange?: ((dragging: boolean) => void) | undefined;
  onCameraFollow?: CameraFollowListener | undefined;
  /** Free the left mouse button for pointer verbs (marquee / click-to-move); orbit moves to the middle button. */
  pointerControls?: boolean | undefined;
}

/** Third-person orbit camera that follows an entity, with drag-to-orbit, zoom limits and optional collision pull-in. */
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
  const followPayloadRef = useRef<CameraFollowState>({
    entityId: "",
    target: { x: 0, y: 0, z: 0 },
    camera: { x: 0, y: 0, z: 0 },
    distance: 0,
  });
  const followId = followEntityId ?? userId;

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const entity = ctx.scene.entity.get(followId);
    if (controls === null || entity === null) return;

    if (runtimeRef.current === null) {
      runtimeRef.current = seedOrbitFollowState({ entityPosition: entity.position, config });
      camera.position.set(runtimeRef.current.camera.x, runtimeRef.current.camera.y, runtimeRef.current.camera.z);
      controls.target.set(runtimeRef.current.target.x, runtimeRef.current.target.y, runtimeRef.current.target.z);
    }

    const turn = ctx.camera.takeTurnTo();
    if (turn !== null) {
      runtimeRef.current = orbitTurnTo(runtimeRef.current, turn);
      camera.position.set(runtimeRef.current.camera.x, runtimeRef.current.camera.y, runtimeRef.current.camera.z);
    }
    const runtime = runtimeRef.current;
    const previousTarget = runtime.target;
    const drawn = ctx.sim.renderPose(followId, drawnPose) ? fillDrawn(drawnPose) : entity.position;
    const desiredTarget = resolveFollowTarget?.(entity) ?? resolveFollowTargetFromPosition(drawn, config);
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
        // Sprites (VFX, billboards) live in the scene; three's Sprite.raycast
        // errors every frame unless the raycaster has a camera, even though we
        // discard sprite hits below. Setting it silences that per-frame log.
        ray.camera = camera;
        let blocked = 0;
        for (const hit of ray.intersectObjects(scene.children, true)) {
          const obj = hit.object;
          if (!obj.visible) continue;
          if ((obj as { isSprite?: boolean }).isSprite === true) continue;
          // Inheritable: decor flags a group jgCameraTransparent and all children pass through.
          if (isCameraOccluderTransparent(obj)) continue;
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

    const [px, , pz] = drawn;
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
    if (onCameraFollow !== undefined) {
      const payload = followPayloadRef.current;
      payload.entityId = followId;
      payload.target = stepped.target;
      payload.camera = runtimeRef.current.camera;
      payload.distance = runtimeRef.current.lockedDistance ?? stepped.distance;
      onCameraFollow(payload);
    }
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
      mouseButtons={orbitMouseButtons(pointerControls === true)}
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