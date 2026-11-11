/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, type ComponentType, type MutableRefObject } from "@jgengine/core/ui/jsx";
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
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RenderPose } from "@jgengine/core/runtime/poseInterpolation";
import { usePlayer } from "@jgengine/react/hooks";
import { useEntityRenderCues } from "@jgengine/core/anim/useEntityRenderCues.draw";
import { clearCameraBoom, sceneCameraQuery } from "./cameraCollision";
import { usePlayerFov, type PlayerFovState } from "./PlayerFov.draw";
import { GAME_SIM_FRAME_PRIORITY, ORBIT_CAMERA_FRAME_PRIORITY } from "./orbitCameraMath";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { SceneObjectPortal, useEngineDraw, useSceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { requestRawPointerLock } from "@jgengine/core/input/pointerLock";
import { readRegisteredFirstPersonMuzzle, registerTrackedFirstPersonMuzzle } from "./customMuzzle.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

const eyePose: RenderPose = [0, 0, 0, 0];

const DEFAULT_SENSITIVITY = 0.0025;
const DEFAULT_MAX_PITCH = 1.45;

const VIEWMODEL_ORIGIN = new THREE.Vector3(0.34, -0.26, -0.72);
const MUZZLE_TIP_LOCAL = new THREE.Vector3(0, 0.03, -0.61);

/** Presentation muzzle in world space; camera-scoped when supplied, false leaves target unchanged. */
export function readFirstPersonMuzzle(target: THREE.Vector3, camera?: THREE.Camera): boolean {
  return readRegisteredFirstPersonMuzzle(target, camera);
}

/** Props handed to a custom viewmodel component (#542): a live cue ref (velocity/bob/firing/reloading/recoil/hit) for the followed entity, driven from your own `useFrame` — read `cuesRef.current` there rather than storing it as render state. */
export interface ViewmodelProps {
  cuesRef: MutableRefObject<EntityRenderCues>;
}

/** Props for GameFirstPersonCamera: look refs, first-person config, the followed entity and an optional custom viewmodel. */
export interface GameFirstPersonCameraProps {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  config?: FirstPersonCameraConfig | undefined;
  followEntityId?: string | undefined;
  /** Custom viewmodel component replacing the built-in three-mesh gun, rendered inside the same camera-locked, muzzle-tracked anchor. Ignored when `config.viewmodel === false`. */
  viewmodel?: ComponentType<ViewmodelProps> | undefined;
  /** Held-weapon source (`GameCameraConfig.weapon`): poses the viewmodel and adds recoil to the look. */
  weapon?: ((entityId: string, ctx: GameContext) => CameraWeaponView | null) | undefined;
}

/** Everything the first-person draw reads, resolved by the React wrapper. */
export interface GameFirstPersonCameraDrawProps extends GameFirstPersonCameraProps {
  ctx: GameContext;
  userId: string;
  playerFov: PlayerFovState;
  /** Shared with the viewmodel: the weapon pose computed each frame. */
  poseRef: MutableRefObject<WeaponPose | null>;
  /** Live render cues for the followed entity (speed/bob feed weapon presentation). */
  cuesRef: MutableRefObject<EntityRenderCues>;
}

/**
 * Draw-side form of the first-person rig: pointer-lock look, eye placement, camera boom collision
 * and weapon presentation all run in `frame` at orbit priority; DOM listeners live in
 * mount/dispose. The viewmodel anchor stays a React component because games supply their own.
 * @internal
 */
export function firstPersonCameraDraw(getProps: () => GameFirstPersonCameraDrawProps): EngineDraw {
  const presentation = createWeaponPresentation();
  const query = sceneCameraQuery(getProps().ctx.scene.raycast);
  let seeded = false;
  let tuning: WeaponPresentationTuning | undefined;
  const lastLook = { yaw: 0, pitch: 0, primed: false };
  let arm: number | null = null;
  let domElement: HTMLCanvasElement | null = null;

  const onClick = () => {
    if (domElement === null) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    if (document.pointerLockElement !== domElement) requestRawPointerLock(domElement);
  };
  const onMove = (event: MouseEvent) => {
    const props = getProps();
    if (domElement === null || document.pointerLockElement !== domElement) return;
    const config = props.config;
    const sensitivity = config?.sensitivity ?? DEFAULT_SENSITIVITY;
    const maxPitch = config?.maxPitch ?? DEFAULT_MAX_PITCH;
    props.yawRef.current -= event.movementX * sensitivity;
    props.pitchRef.current = Math.max(
      -maxPitch,
      Math.min(maxPitch, props.pitchRef.current - event.movementY * sensitivity),
    );
  };

  return {
    priority: ORBIT_CAMERA_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      domElement = state.gl.domElement;
      domElement.addEventListener("click", onClick);
      window.addEventListener("mousemove", onMove);
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      const config = props.config;
      const eyeHeight = config?.eyeHeight ?? DEFAULT_EYE_HEIGHT;
      const maxPitch = config?.maxPitch ?? DEFAULT_MAX_PITCH;
      const followId = props.followEntityId ?? props.userId;
      const entity = props.ctx.scene.entity.get(followId);
      if (entity === null) return;
      const turn = props.ctx.camera.takeTurnTo();
      if (turn !== null) props.yawRef.current = turn;
      if (!seeded) {
        seeded = true;
        props.yawRef.current = entity.rotationY;
      }
      const view = props.weapon?.(followId, props.ctx) ?? null;
      if (!lastLook.primed) {
        lastLook.primed = true;
        lastLook.yaw = props.yawRef.current;
        lastLook.pitch = props.pitchRef.current;
      }
      const step = Math.max(1e-4, state.delta);
      let pose: WeaponPose | null = null;
      if (view !== null) {
        if (view.presentation !== tuning) {
          tuning = view.presentation;
          presentation.retune(view.presentation ?? {});
        }
        pose = presentation.update(state.delta, {
          lookYawRate: (props.yawRef.current - lastLook.yaw) / step,
          lookPitchRate: (props.pitchRef.current - lastLook.pitch) / step,
          speed: props.cuesRef.current.speed,
          bobPhase: props.cuesRef.current.bobPhase,
          handling: view.handling,
        });
      }
      lastLook.yaw = props.yawRef.current;
      lastLook.pitch = props.pitchRef.current;
      props.poseRef.current = pose;
      const yaw = props.yawRef.current - (pose?.lookYaw ?? 0);
      const pitch = Math.max(-maxPitch, Math.min(maxPitch, props.pitchRef.current + (pose?.lookPitch ?? 0)));
      const cosPitch = Math.cos(pitch);
      // The eye rides the drawn (interpolated) body so a fixed-step sim stays smooth on a fast display.
      const body = props.ctx.sim.renderPose(followId, eyePose) ? eyePose : entity.position;
      const eye = {
        x: body[0],
        y: body[1] + eyeHeight,
        z: body[2],
      };
      const look = {
        x: eye.x + Math.sin(yaw) * cosPitch,
        y: eye.y + Math.sin(pitch),
        z: eye.z + Math.cos(yaw) * cosPitch,
      };
      const camera = state.camera;
      const collision = config?.collision;
      if (collision !== false) {
        const options = collision ?? {};
        const armBack = options.armBack ?? 1.5;
        // The boom anchors behind the eye along the look ray, so a trunk the body reached
        // pulls the camera back toward it instead of leaving the view inside the bark.
        const forward = { x: Math.sin(yaw) * cosPitch, y: Math.sin(pitch), z: Math.cos(yaw) * cosPitch };
        const cleared = clearCameraBoom({
          pivot: { x: eye.x - forward.x * armBack, y: eye.y - forward.y * armBack, z: eye.z - forward.z * armBack },
          desired: eye,
          query,
          clearance: options.clearance ?? ((camera as THREE.PerspectiveCamera).near || 0.1) + 0.15,
          previousArm: arm,
          deltaSeconds: state.delta,
        });
        arm = cleared.arm;
        camera.position.set(cleared.position.x, cleared.position.y, cleared.position.z);
        look.x += cleared.position.x - eye.x;
        look.y += cleared.position.y - eye.y;
        look.z += cleared.position.z - eye.z;
      } else {
        arm = null;
        camera.position.set(eye.x, eye.y, eye.z);
      }
      camera.lookAt(look.x, look.y, look.z);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera === true) {
        const perspective = camera as THREE.PerspectiveCamera;
        const fov = props.playerFov.fov * (pose?.fovScale ?? 1);
        if (Math.abs(perspective.fov - fov) > 0.001) {
          perspective.fov = fov;
          perspective.updateProjectionMatrix();
        }
      }
    },
    dispose() {
      if (domElement !== null) {
        domElement.removeEventListener("click", onClick);
        window.removeEventListener("mousemove", onMove);
        domElement = null;
      }
      seeded = false;
      lastLook.primed = false;
      arm = null;
    },
  };
}

/** First-person camera locked to the followed entity's eyes, with mouse look, head bob and the muzzle-tracked viewmodel. */
export function GameFirstPersonCamera(props: GameFirstPersonCameraProps) {
  const { userId } = usePlayer();
  const ctx = useGameContext();
  const playerFov = usePlayerFov();
  const camera = useEngineHost().frame.camera;
  const followId = props.followEntityId ?? userId;
  const cuesRef = useEntityRenderCues(followId);
  const poseRef = useRef<WeaponPose | null>(null);
  const latest = useRef<GameFirstPersonCameraDrawProps>({ ...props, ctx, userId, playerFov, poseRef, cuesRef });
  latest.current = { ...props, ctx, userId, playerFov, poseRef, cuesRef };
  useEngineDraw(() => firstPersonCameraDraw(() => latest.current), [ctx]);
  if (props.config?.viewmodel === false) return null;
  return <FirstPersonViewmodel camera={camera} viewmodel={props.viewmodel} cuesRef={cuesRef} poseRef={poseRef} />;
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
  const group = useMemo(() => {
    const next = new THREE.Group();
    if (Viewmodel === undefined) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.55), new THREE.MeshStandardMaterial({ color: "#22262d", metalness: 0.6, roughness: 0.35 }));
      body.position.set(0, 0, -0.22);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.11), new THREE.MeshStandardMaterial({ color: "#33373f", metalness: 0.4, roughness: 0.5 }));
      grip.position.set(0, -0.13, 0.04);
      grip.rotation.x = 0.35;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 10), new THREE.MeshStandardMaterial({ color: "#0e0f12", metalness: 0.7, roughness: 0.3 }));
      barrel.position.set(0, 0.03, -0.52);
      barrel.rotation.x = Math.PI / 2;
      next.add(body, grip, barrel);
    }
    return next;
  }, [Viewmodel]);
  useSceneObjectAttach(group);
  const muzzleWorld = useRef(new THREE.Vector3());
  const muzzleTracked = useRef(false);
  useEffect(() => {
    muzzleTracked.current = false;
    return registerTrackedFirstPersonMuzzle(camera, (target) => {
      if (!muzzleTracked.current) return false;
      target.copy(muzzleWorld.current);
      return true;
    });
  }, [camera]);
  useFrameTask(() => {
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
    group.localToWorld(muzzleWorld.current.copy(MUZZLE_TIP_LOCAL));
    muzzleTracked.current = true;
  }, GAME_SIM_FRAME_PRIORITY);
  return (
    <SceneObjectPortal object={group}>
      {Viewmodel !== undefined ? <Viewmodel cuesRef={cuesRef} /> : null}
    </SceneObjectPortal>
  );
}
