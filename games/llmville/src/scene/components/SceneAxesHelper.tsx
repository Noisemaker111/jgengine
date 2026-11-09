import { AxesHelper } from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

/**
 * Renders colored axes at the given position for orientation debugging.
 * Red = +X (right), Green = +Y (up), Blue = +Z (front/door — level-design "north").
 *
 * Enable with ?axes=1 or ?debug=axes in the URL.
 * See docs/design/asset-spatial-contract.md for the full spatial contract.
 */
export function sceneAxesHelperDraw({ position = [0, 0, 0], size = 2 }: { position?: [number, number, number]; size?: number }): EngineDraw {
  let axes: AxesHelper | null = null;
  return {
    mount(state: EngineFrameState) {
      axes = new AxesHelper(size);
      axes.position.set(position[0], position[1], position[2]);
      state.scene.add(axes);
    },
    dispose(state: EngineFrameState) {
      if (axes !== null) state.scene.remove(axes);
      axes = null;
    },
  };
}

export function SceneAxesHelper({ position = [0, 0, 0], size = 2 }: { position?: [number, number, number]; size?: number }) {
  useEngineDraw(() => sceneAxesHelperDraw({ position, size }), [position, size]);
  return null;
}

export function useShowSceneAxes(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("axes") === "1" || params.get("debug") === "axes";
}
