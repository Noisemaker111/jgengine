import { describe, expect, test } from "bun:test";
import { PerspectiveCamera, Vector3 } from "three";

import { CAMERA_FRUSTUM_DEFAULTS } from "@jgengine/core/game/playableGame";
import { resolveTopDown, topDownPose, type CameraPose } from "@jgengine/shell/camera";

import { game } from "../game.config";
import { COLS, ROWS, XMIN, ZMIN } from "./maze";

const WALL_TOP = 0.8;
const FLOOR_MARGIN = 1;
const BOARD_CENTER = { x: 0, y: 0, z: 0 };

function shellCameraPose(): CameraPose {
  const config = game.camera;
  if (config?.rig !== "topDown") throw new Error("maze-muncher expects the topDown rig");
  const fov = config.frustum?.fov ?? CAMERA_FRUSTUM_DEFAULTS.fov;
  return topDownPose(BOARD_CENTER, resolveTopDown(config.topDown), fov);
}

function projectedBoardCorners(pose: CameraPose): Vector3[] {
  const config = game.camera;
  const camera = new PerspectiveCamera(
    pose.fov,
    16 / 9,
    config?.frustum?.near ?? CAMERA_FRUSTUM_DEFAULTS.near,
    config?.frustum?.far ?? CAMERA_FRUSTUM_DEFAULTS.far,
  );
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const corners: Vector3[] = [];
  for (const x of [XMIN - FLOOR_MARGIN, XMIN + COLS - 1 + FLOOR_MARGIN]) {
    for (const z of [ZMIN - FLOOR_MARGIN, ZMIN + ROWS - 1 + FLOOR_MARGIN]) {
      for (const y of [0, WALL_TOP]) {
        corners.push(new Vector3(x, y, z).project(camera));
      }
    }
  }
  return corners;
}

describe("maze-muncher camera frames the board", () => {
  test("the camera sits inside the far plane", () => {
    const pose = shellCameraPose();
    const distance = Math.hypot(
      pose.position.x - pose.lookAt.x,
      pose.position.y - pose.lookAt.y,
      pose.position.z - pose.lookAt.z,
    );
    expect(distance).toBeLessThan(game.camera?.frustum?.far ?? CAMERA_FRUSTUM_DEFAULTS.far);
  });

  test("every board corner projects inside the view frustum", () => {
    const corners = projectedBoardCorners(shellCameraPose());
    for (const ndc of corners) {
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.z)).toBeLessThanOrEqual(1);
    }
  });
});
