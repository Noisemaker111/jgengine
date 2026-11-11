/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, type MutableRefObject } from "@jgengine/core/ui/jsx";
import { MOUSE, PerspectiveCamera, Raycaster, type Camera, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
  type ResolvedOrbitCameraConfig,
} from "./orbitCameraMath";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerCameraControls } from "./activeControls.draw";
import { usePlayerFov, type PlayerFovState } from "./PlayerFov.draw";
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

/** Everything the orbit draw reads each frame, resolved by the React wrapper. */
export interface GameOrbitCameraDrawProps extends GameOrbitCameraProps {
  ctx: GameContext;
  userId: string;
  playerFov: PlayerFovState;
}

/**
 * Draw-side form of {@link GameOrbitCamera}: the follow/turn/collision math runs in `frame` at
 * orbit priority while three's `OrbitControls` owns drag, damped zoom and polar limits.
 * @internal
 */
export function gameOrbitCameraDraw(getProps: () => GameOrbitCameraDrawProps): EngineDraw {
  let controls: OrbitControls | null = null;
  let unregisterControls: (() => void) | null = null;
  let runtime: OrbitFollowRuntimeState | null = null;
  let dragging = false;
  let appliedPatch: GameOrbitCameraProps["config"] | null = null;
  let resolved: ResolvedOrbitCameraConfig | null = null;
  const raycaster = new Raycaster();
  const collisionDir = new Vector3();
  const collisionOrigin = new Vector3();
  const followPayload: CameraFollowState = {
    entityId: "",
    target: { x: 0, y: 0, z: 0 },
    camera: { x: 0, y: 0, z: 0 },
    distance: 0,
  };

  const syncConfig = () => {
    if (controls === null) return;
    const props = getProps();
    const patch = props.config;
    if (resolved === null || appliedPatch !== patch) {
      appliedPatch = patch;
      resolved = resolveOrbitCameraConfig(patch);
    }
    const config = resolved;
    controls.enableDamping = true;
    controls.dampingFactor = config.dampingFactor;
    controls.rotateSpeed = config.rotateSpeed;
    controls.zoomSpeed = config.zoomSpeed;
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.minDistance = config.minDistance;
    controls.maxDistance = config.maxDistance;
    controls.maxPolarAngle = config.maxPolarAngle;
    controls.minPolarAngle = config.minPolarAngle;
    controls.screenSpacePanning = false;
    controls.mouseButtons = orbitMouseButtons(props.pointerControls === true);
  };

  const onStart = () => {
    dragging = true;
    getProps().onDragChange?.(true);
  };
  const onEnd = () => {
    dragging = false;
    getProps().onDragChange?.(false);
    if (controls !== null && runtime !== null) {
      runtime.lockedDistance = controls.getDistance();
    }
  };

  return {
    priority: ORBIT_CAMERA_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      controls = new OrbitControls(state.camera, state.gl.domElement);
      controls.addEventListener("start", onStart);
      controls.addEventListener("end", onEnd);
      unregisterControls = registerCameraControls(controls);
      syncConfig();
    },
    update() {
      syncConfig();
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      const ctl = controls;
      if (ctl === null) return;
      const config = resolved ?? resolveOrbitCameraConfig(props.config);
      const camera = state.camera;
      const entity = props.ctx.scene.entity.get(props.followEntityId ?? props.userId);
      if (entity === null) return;

      if (runtime === null) {
        runtime = seedOrbitFollowState({ entityPosition: entity.position, config });
        camera.position.set(runtime.camera.x, runtime.camera.y, runtime.camera.z);
        ctl.target.set(runtime.target.x, runtime.target.y, runtime.target.z);
      }

      const turn = props.ctx.camera.takeTurnTo();
      if (turn !== null) {
        runtime = orbitTurnTo(runtime, turn);
        camera.position.set(runtime.camera.x, runtime.camera.y, runtime.camera.z);
      }
      const previousTarget = runtime.target;
      const drawn = props.ctx.sim.renderPose(props.followEntityId ?? props.userId, drawnPose) ? fillDrawn(drawnPose) : entity.position;
      const desiredTarget = props.resolveFollowTarget?.(entity) ?? resolveFollowTargetFromPosition(drawn, config);
      const stepped = orbitFollowStep({
        state: runtime,
        desiredTarget,
        deltaSeconds: state.delta,
        config,
        dragging,
      });

      ctl.target.set(stepped.target.x, stepped.target.y, stepped.target.z);

      if (dragging) {
        camera.position.x += stepped.target.x - previousTarget.x;
        camera.position.y += stepped.target.y - previousTarget.y;
        camera.position.z += stepped.target.z - previousTarget.z;
      } else {
        camera.position.set(stepped.camera.x, stepped.camera.y, stepped.camera.z);
      }

      ctl.update();

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
          const dir = collisionDir.set(dx / dist, dy / dist, dz / dist);
          const ray = raycaster;
          ray.set(collisionOrigin.set(t.x, t.y, t.z), dir);
          ray.near = config.collision.minTargetDistance;
          ray.far = dist;
          // Sprites (VFX, billboards) live in the scene; three's Sprite.raycast
          // errors every frame unless the raycaster has a camera, even though we
          // discard sprite hits below. Setting it silences that per-frame log.
          ray.camera = camera;
          let blocked = 0;
          for (const hit of ray.intersectObjects(state.scene.children, true)) {
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

      runtime = {
        target: stepped.target,
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        lockedDistance: dragging ? ctl.getDistance() : stepped.lockedDistance,
      };

      const [px, , pz] = drawn;
      props.yawRef.current = orbitYawFromCamera(camera.position.x, camera.position.z, px, pz);
      if (props.pitchRef !== undefined) {
        props.pitchRef.current = cameraLookPitch(
          { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          stepped.target,
        );
      }
      if ((camera as PerspectiveCamera).isPerspectiveCamera === true) {
        const perspective = camera as PerspectiveCamera;
        const targetFov =
          pulledDistance > 0 && pulledDistance < desiredDistance
            ? compensatedFov(props.playerFov.fov, desiredDistance, pulledDistance)
            : props.playerFov.fov;
        if (Math.abs(perspective.fov - targetFov) > 0.001) {
          perspective.fov = targetFov;
          perspective.updateProjectionMatrix();
        }
      }
      if (props.onCameraFollow !== undefined) {
        const payload = followPayload;
        payload.entityId = props.followEntityId ?? props.userId;
        payload.target = stepped.target;
        payload.camera = runtime.camera;
        payload.distance = runtime.lockedDistance ?? stepped.distance;
        props.onCameraFollow(payload);
      }
    },
    dispose() {
      controls?.removeEventListener("start", onStart);
      controls?.removeEventListener("end", onEnd);
      unregisterControls?.();
      unregisterControls = null;
      controls?.dispose();
      controls = null;
      runtime = null;
      dragging = false;
      appliedPatch = null;
      resolved = null;
    },
  };
}

/** Third-person orbit camera that follows an entity, with drag-to-orbit, zoom limits and optional collision pull-in. */
export function GameOrbitCamera(props: GameOrbitCameraProps) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const playerFov = usePlayerFov();
  const latest = useRef<GameOrbitCameraDrawProps>({ ...props, ctx, userId, playerFov });
  latest.current = { ...props, ctx, userId, playerFov };
  useEngineDraw(() => gameOrbitCameraDraw(() => latest.current), [ctx]);
  return null;
}

/** Seed orbit target before controls mount (demo spawn at origin). */
export function seedOrbitCameraTarget(camera: Camera, target: Vector3, distance: number, height: number): void {
  camera.position.set(target.x, height, target.z - distance);
  camera.lookAt(target);
}
