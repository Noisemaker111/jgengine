/** @jsxImportSource @jgengine/core/ui/jsx */
import { useLayoutEffect, useRef } from "@jgengine/core/ui/jsx";

import { useFrameJoin } from "./engineHost.draw";
import type { EngineFrameState } from "./engineLoop.draw";

/** @internal */
export function useFrameTask(
  callback: (state: EngineFrameState, delta: number) => void,
  priority = 0,
): void {
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  const joinFrame = useFrameJoin();
  useLayoutEffect(
    () => joinFrame(priority, (state, delta) => ref.current(state, delta)),
    [priority],
  );
}
