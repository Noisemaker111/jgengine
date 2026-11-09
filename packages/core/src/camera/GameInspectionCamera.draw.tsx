import { useRef } from "react";
import { MOUSE } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import {
  resolveInspectionCameraConfig,
  resolveInspectionZoomToCursor,
  seedInspectionCamera,
  type InspectionCameraConfig,
} from "./inspectionCameraMath";

/** Props for GameInspectionCamera: the inspection orbit config patch (target, distances, zoom anchor). */
export interface GameInspectionCameraProps {
  config?: InspectionCameraConfig | undefined;
}

/**
 * Model-viewer / editor rig (#207.7, #866): left-click selects (editor), middle-drag pans, right-drag orbits, scroll zooms toward a configurable anchor. Orbits a fixed `target`; never reads player/entity state.
 * @internal
 */
export function gameInspectionCameraDraw(getConfig: () => InspectionCameraConfig | undefined): EngineDraw {
  let controls: OrbitControls | null = null;
  let seeded = false;
  let appliedTarget: { x: number; y: number; z: number } | null = null;
  const sync = (state: EngineFrameState) => {
    if (controls === null) return;
    const config = resolveInspectionCameraConfig(getConfig());
    controls.enableDamping = true;
    controls.dampingFactor = config.dampingFactor;
    controls.rotateSpeed = config.rotateSpeed;
    controls.zoomSpeed = config.zoomSpeed;
    controls.zoomToCursor = resolveInspectionZoomToCursor(config.anchor);
    controls.enablePan = config.pan;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.minDistance = config.minDistance;
    controls.maxDistance = config.maxDistance;
    controls.minPolarAngle = config.minPolarAngle;
    controls.maxPolarAngle = config.maxPolarAngle;
    controls.screenSpacePanning = true;
    controls.mouseButtons = { MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };
    if (!seeded) {
      const seed = seedInspectionCamera(config);
      state.camera.position.set(seed.camera.x, seed.camera.y, seed.camera.z);
      state.camera.lookAt(seed.target.x, seed.target.y, seed.target.z);
      controls.target.set(seed.target.x, seed.target.y, seed.target.z);
      controls.update();
      seeded = true;
      appliedTarget = { x: config.target.x, y: config.target.y, z: config.target.z };
      return;
    }
    const previous = appliedTarget;
    if (previous !== null && (previous.x !== config.target.x || previous.y !== config.target.y || previous.z !== config.target.z)) {
      const before = controls.target.clone();
      controls.target.set(config.target.x, config.target.y, config.target.z);
      state.camera.position.add(controls.target.clone().sub(before));
      controls.update();
      appliedTarget = { x: config.target.x, y: config.target.y, z: config.target.z };
    }
  };
  return {
    mount(state: EngineFrameState) {
      controls = new OrbitControls(state.camera, state.gl.domElement);
      sync(state);
    },
    frame() {
      controls?.update();
    },
    update: sync,
    dispose() {
      controls?.dispose();
      controls = null;
      seeded = false;
      appliedTarget = null;
    },
  };
}

/** Model-viewer / editor rig (#207.7, #866): left-click selects (editor), middle-drag pans, right-drag orbits, scroll zooms toward a configurable anchor. Orbits a fixed `target`; never reads player/entity state. */
export function GameInspectionCamera({ config }: GameInspectionCameraProps) {
  const latest = useRef(config);
  latest.current = config;
  useEngineDraw(() => gameInspectionCameraDraw(() => latest.current), []);
  return null;
}
