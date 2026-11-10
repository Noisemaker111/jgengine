/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, useRef, useSyncExternalStore } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
import {
  resolveViewports,
  viewportPixels,
  type ViewportCameraConfig,
  type ViewportDef,
  type ViewportsConfig,
} from "@jgengine/core/game/viewports";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { localPlayers, type LocalPlayerSlot } from "@jgengine/core/runtime/localPlayers";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { createChaseRigState, resolveChase, resolveTopDown, stepChase, topDownPose, type CameraPose, type ChaseRigState } from "./rigMath";
import type { Xyz } from "@jgengine/core/math/xyz";

const SEAT_YAW = new WeakMap<GameContext, Map<string, number>>();

/** Camera yaw the split-screen renderer last used for a seat's user, so the walk controller moves that seat camera-relative. @internal */
export function seatCameraYaw(ctx: GameContext, userId: string): number | undefined {
  return SEAT_YAW.get(ctx)?.get(userId);
}

function seatSlotIds(ctx: GameContext): readonly string[] {
  return localPlayers(ctx).slots().map((slot) => slot.slotId);
}

/**
 * The viewports for the seats currently joined, re-resolved when a seat joins or leaves.
 * @internal
 */
export function useSeatViewports(ctx: GameContext, config: ViewportsConfig | undefined): readonly ViewportDef[] {
  const seats = localPlayers(ctx);
  const key = useSyncExternalStore(
    seats.subscribe,
    () => seatSlotIds(ctx).join("|"),
    () => seatSlotIds(ctx).join("|"),
  );
  return useMemo(() => resolveViewports(config, key === "" ? [] : key.split("|")), [config, key]);
}

interface SeatRig {
  camera: THREE.PerspectiveCamera;
  chase: ChaseRigState;
}

function seatRigKind(camera: ViewportCameraConfig | undefined, main: GameCameraConfig | undefined): "chase" | "topDown" {
  return camera?.rig ?? (main?.rig === "topDown" ? "topDown" : "chase");
}

export interface SplitScreenRendererProps {
  ctx: GameContext;
  viewports: readonly ViewportDef[];
  config: ViewportsConfig | undefined;
  mainCamera: GameCameraConfig | undefined;
}

/**
 * Draw-side form of {@link SplitScreenRenderer}: one scissored render per viewport at render
 * priority, seat rigs persisting across prop changes.
 * @internal
 */
export function splitScreenRendererDraw(getProps: () => SplitScreenRendererProps): EngineDraw {
  const rigs = new Map<string, SeatRig>();

  function seatCamera(slot: LocalPlayerSlot, cameraConfig: ViewportCameraConfig | undefined, dt: number, yaws: Map<string, number>, props: SplitScreenRendererProps, mainCamera: THREE.Camera) {
    let rig = rigs.get(slot.slotId);
    if (rig === undefined) {
      const created = new THREE.PerspectiveCamera();
      if (mainCamera instanceof THREE.PerspectiveCamera) {
        created.near = mainCamera.near;
        created.far = mainCamera.far;
      }
      rig = { camera: created, chase: createChaseRigState() };
      rigs.set(slot.slotId, rig);
    }
    const entity = props.ctx.scene.entity.get(props.ctx.player.possession.active(slot.userId));
    const follow: Xyz = entity === null ? { x: 0, y: 0, z: 0 } : { x: entity.position[0], y: entity.position[1], z: entity.position[2] };
    let pose: CameraPose;
    if (seatRigKind(cameraConfig, props.mainCamera) === "topDown") {
      const resolved = resolveTopDown(cameraConfig?.topDown ?? props.mainCamera?.rigs?.topDown);
      pose = topDownPose(follow, resolved, rig.camera.fov);
      yaws.set(slot.userId, resolved.yaw);
    } else {
      const velocity = entity?.velocity;
      const step = stepChase(
        rig.chase,
        {
          follow,
          yaw: entity?.rotationY ?? 0,
          bodyPitch: entity?.rotationX ?? 0,
          velocity: velocity === undefined ? null : { x: velocity[0], y: velocity[1], z: velocity[2] },
          lookBack: false,
          fovKick: 0,
        },
        resolveChase(cameraConfig?.chase ?? props.mainCamera?.rigs?.chase),
        dt,
      );
      pose = step.pose;
      yaws.set(slot.userId, step.anchorYaw);
    }
    rig.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    rig.camera.fov = pose.fov;
    rig.camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    return rig.camera;
  }

  return {
    priority: 1,
    frame(state: EngineFrameState) {
      const props = getProps();
      const gl = state.gl;
      const seats = localPlayers(props.ctx);
      let yaws = SEAT_YAW.get(props.ctx);
      if (yaws === undefined) {
        yaws = new Map();
        SEAT_YAW.set(props.ctx, yaws);
      }
      gl.setScissorTest(true);
      for (const def of props.viewports) {
        const slot = seats.slot(def.slot);
        if (slot === null) continue;
        const pixels = viewportPixels(def.rect, state.size.width, state.size.height);
        const view = slot.index === 0 ? state.camera : seatCamera(slot, def.camera ?? props.config?.camera, state.delta, yaws, props, state.camera);
        if (view instanceof THREE.PerspectiveCamera) {
          view.aspect = pixels.width / pixels.height;
          view.updateProjectionMatrix();
        }
        gl.setViewport(pixels.x, pixels.y, pixels.width, pixels.height);
        gl.setScissor(pixels.x, pixels.y, pixels.width, pixels.height);
        gl.render(state.scene, view);
      }
      gl.setScissorTest(false);
      gl.setViewport(0, 0, state.size.width, state.size.height);
      if (state.camera instanceof THREE.PerspectiveCamera) {
        state.camera.aspect = state.size.width / state.size.height;
        state.camera.updateProjectionMatrix();
      }
    },
    dispose() {
      rigs.clear();
    },
  };
}

/**
 * Draws one scissored render per viewport. The primary seat keeps the main camera and its rig; every
 * other seat gets a follow camera (chase or top-down) on its possessed entity. Mounted only while more
 * than one viewport is drawn, since a render-priority frame callback takes over R3F's own render.
 * @internal
 */
export function SplitScreenRenderer(props: SplitScreenRendererProps) {
  const latest = useRef<SplitScreenRendererProps>(props);
  latest.current = props;
  useEngineDraw(() => splitScreenRendererDraw(() => latest.current), []);
  return null;
}
