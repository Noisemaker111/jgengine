import { useLayoutEffect, useRef } from "react";

import { useFrameJoin } from "./engineHost.draw";
import type { EngineFrameState } from "./engineLoop.draw";

/**
 * A per-frame callback on the shared frame board, for a React component: the
 * callback always sees the latest render's closure (a ref swaps it in place),
 * and the board is joined once per priority.
 * @internal
 */
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
