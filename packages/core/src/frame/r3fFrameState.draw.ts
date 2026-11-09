import type { RootState } from "@react-three/fiber";

import type { EngineFrameState, EngineFrameloop } from "./engineLoop.draw";

/**
 * Build the {@link EngineFrameState} facade over r3f's RootState. Used by the
 * r3f pump (per rendered frame) and by `useEngineDraw` (once at mount, where
 * only the stable scene/camera/renderer references matter).
 * @internal
 */
export function frameStateFromR3F(state: RootState, delta: number): EngineFrameState {
  return {
    renderer: state.gl,
    gl: state.gl,
    scene: state.scene,
    camera: state.camera,
    clock: state.clock,
    size: state.size,
    elapsed: state.clock.elapsedTime,
    delta,
    width: state.size.width,
    height: state.size.height,
    frameloop: state.frameloop as EngineFrameloop,
    renderPriority: state.internal.priority,
    invalidate: () => state.invalidate(),
    setCovered: (covered: boolean) => state.setFrameloop(covered ? "never" : "always"),
    get covered() {
      return state.frameloop === "never";
    },
  };
}

/**
 * The same facade, but every field reads the store live. For the
 * `EngineHostProvider` inside a Canvas: DOM overlays and draw `update`s hold
 * the facade across frames, so `camera`, `size` and `frameloop` must track
 * r3f state (camera swaps, resizes, cover overrides) instead of freezing at
 * mount. `delta` stays 0 — mount/update callers never consumed it; frame
 * work gets a fresh per-frame state from the pump.
 * @internal
 */
export function liveFrameStateFromR3F(get: () => RootState): EngineFrameState {
  return {
    get renderer() {
      return get().gl;
    },
    get gl() {
      return get().gl;
    },
    get scene() {
      return get().scene;
    },
    get camera() {
      return get().camera;
    },
    get clock() {
      return get().clock;
    },
    get size() {
      return get().size;
    },
    get elapsed() {
      return get().clock.elapsedTime;
    },
    get delta() {
      return 0;
    },
    get width() {
      return get().size.width;
    },
    get height() {
      return get().size.height;
    },
    get frameloop() {
      return get().frameloop as EngineFrameloop;
    },
    get renderPriority() {
      return get().internal.priority;
    },
    invalidate: () => get().invalidate(),
    setCovered: (covered: boolean) => get().setFrameloop(covered ? "never" : "always"),
    get covered() {
      return get().frameloop === "never";
    },
  };
}
