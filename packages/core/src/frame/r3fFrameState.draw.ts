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
