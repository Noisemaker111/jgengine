import { addAfterEffect, addEffect, useStore, type RootState } from "@react-three/fiber";
import { useEffect, useMemo } from "react";

import { flushAfterRenderTasks, flushBeforeRenderTasks } from "./afterRenderBoard.draw";
import { bindFrameSource } from "./frameBoard.draw";
import { bindEngineHostProbe } from "./engineHost.draw";
import { frameStateFromR3F } from "./r3fFrameState.draw";
import { r3fEngineHostFromStore } from "./r3fEngineHost.draw";

/**
 * Temporary bridge while the Canvas still owns rendering: binds the shared
 * frame board to r3f's subscriber list so files already converted off
 * `useFrame` keep their priority order against the ones that are not, and
 * publishes the r3f {@link EngineHost} probe for roots that render this as a
 * sibling of the components under test. `createEngineLoop` binds the same
 * board to the engine's ordered draws and `EngineHostProvider` replaces the
 * probe when the Canvas is gone; this component is deleted with it.
 * @internal
 */
export function FrameBoardPump(): null {
  const store = useStore();
  const host = useMemo(() => r3fEngineHostFromStore(store), [store]);
  // Bound during render, not in an effect: draw wrappers resolve the host
  // while rendering, before any effect has run. Idempotent under StrictMode's
  // double render; the last-mounted pump wins, matching bindFrameSource.
  bindEngineHostProbe(() => host);
  useEffect(() => {
    bindFrameSource((priority, run) => {
      const task = { current: (state: RootState, delta: number) => run(frameStateFromR3F(state, delta), delta) };
      return store.getState().internal.subscribe(task, priority, store);
    });
    const leaveBefore = addEffect(flushBeforeRenderTasks);
    const leaveAfter = addAfterEffect(flushAfterRenderTasks);
    return () => {
      bindFrameSource(null);
      bindEngineHostProbe(null);
      leaveBefore();
      leaveAfter();
    };
  }, [store]);
  return null;
}
