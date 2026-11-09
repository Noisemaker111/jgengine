import { useStore, type RootState } from "@react-three/fiber";
import { useEffect } from "react";

import { bindFrameSource } from "./frameBoard.draw";
import { frameStateFromR3F } from "./r3fFrameState.draw";

/**
 * Temporary bridge while the Canvas still owns rendering: binds the shared
 * frame board to r3f's subscriber list so files already converted off
 * `useFrame` keep their priority order against the ones that are not.
 * `createEngineLoop` binds the same board to the engine's ordered draws when
 * the Canvas is gone; this component is deleted with it. Test harnesses that
 * mount hooks in a bare r3f root render this alongside them.
 * @internal
 */
export function FrameBoardPump(): null {
  const store = useStore();
  useEffect(() => {
    bindFrameSource((priority, run) => {
      const task = { current: (state: RootState, delta: number) => run(frameStateFromR3F(state, delta), delta) };
      return store.getState().internal.subscribe(task, priority, store);
    });
    return () => bindFrameSource(null);
  }, [store]);
  return null;
}
