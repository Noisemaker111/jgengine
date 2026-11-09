import { useStore, type RootState } from "@react-three/fiber";
import { useEffect } from "react";

import { bindFrameSource } from "@jgengine/core/frame/frameBoard.draw";
import type { EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

/**
 * Temporary bridge while the Canvas still owns rendering: binds the shared
 * frame board to r3f's subscriber list so files already converted off
 * `useFrame` keep their priority order against the ones that are not.
 * `createEngineLoop` binds the same board to the engine's ordered draws when
 * the Canvas is gone; this component is deleted with it.
 * @internal
 */
export function FrameBoardPump(): null {
  const store = useStore();
  useEffect(() => {
    const facade = (state: RootState, delta: number): EngineFrameState => ({
      renderer: state.gl,
      scene: state.scene,
      camera: state.camera,
      clock: state.clock,
      elapsed: state.clock.elapsedTime,
      delta,
      width: state.size.width,
      height: state.size.height,
      invalidate: () => state.invalidate(),
      setCovered: (covered: boolean) => state.setFrameloop(covered ? "never" : "always"),
      get covered() {
        return state.frameloop === "never";
      },
    });
    bindFrameSource((priority, run) => {
      const task = { current: (state: RootState, delta: number) => run(facade(state, delta), delta) };
      return store.getState().internal.subscribe(task, priority, store);
    });
    return () => bindFrameSource(null);
  }, [store]);
  return null;
}
