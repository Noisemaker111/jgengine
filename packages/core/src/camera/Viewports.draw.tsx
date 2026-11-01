import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useSyncExternalStore } from "react";
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

/**
 * Draws one scissored render per viewport. The primary seat keeps the main camera and its rig; every
 * other seat gets a follow camera (chase or top-down) on its possessed entity. Mounted only while more
 * than one viewport is drawn, since a render-priority frame callback takes over R3F's own render.
 * @internal
 */
export function SplitScreenRenderer({
  ctx,
  viewports,
  config,
  mainCamera,
}: {
  ctx: GameContext;
  viewports: readonly ViewportDef[];
  config: ViewportsConfig | undefined;
  mainCamera: GameCameraConfig | undefined;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const rigs = useRef(new Map<string, SeatRig>());

  useFrame((_state, dt) => {
    const seats = localPlayers(ctx);
    let yaws = SEAT_YAW.get(ctx);
    if (yaws === undefined) {
      yaws = new Map();
      SEAT_YAW.set(ctx, yaws);
    }
    gl.setScissorTest(true);
    for (const def of viewports) {
      const slot = seats.slot(def.slot);
      if (slot === null) continue;
      const pixels = viewportPixels(def.rect, size.width, size.height);
      const view = slot.index === 0 ? camera : seatCamera(slot, def.camera ?? config?.camera, dt, yaws);
      if (view instanceof THREE.PerspectiveCamera) {
        view.aspect = pixels.width / pixels.height;
        view.updateProjectionMatrix();
      }
      gl.setViewport(pixels.x, pixels.y, pixels.width, pixels.height);
      gl.setScissor(pixels.x, pixels.y, pixels.width, pixels.height);
      gl.render(scene, view);
    }
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
    }
  }, 1);

  function seatCamera(slot: LocalPlayerSlot, cameraConfig: ViewportCameraConfig | undefined, dt: number, yaws: Map<string, number>) {
    let rig = rigs.current.get(slot.slotId);
    if (rig === undefined) {
      const created = new THREE.PerspectiveCamera();
      if (camera instanceof THREE.PerspectiveCamera) {
        created.near = camera.near;
        created.far = camera.far;
      }
      rig = { camera: created, chase: createChaseRigState() };
      rigs.current.set(slot.slotId, rig);
    }
    const entity = ctx.scene.entity.get(ctx.player.possession.active(slot.userId));
    const follow: Xyz = entity === null ? { x: 0, y: 0, z: 0 } : { x: entity.position[0], y: entity.position[1], z: entity.position[2] };
    let pose: CameraPose;
    if (seatRigKind(cameraConfig, mainCamera) === "topDown") {
      const resolved = resolveTopDown(cameraConfig?.topDown ?? mainCamera?.rigs?.topDown);
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
        resolveChase(cameraConfig?.chase ?? mainCamera?.rigs?.chase),
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

  return null;
}
