import { useLayoutEffect, useRef } from "react";

import { joinFrameTask } from "./frameBoard.draw";
import type { EngineFrameState } from "./engineLoop.draw";

/**
 * `useFrame` on the shared frame board: the callback always sees the latest
 * render's closure (a ref swaps it in place, like r3f's subscriber), and the
 * board subscription is made once per priority. This is the drop-in form of
 * `useFrame` for files still mounted inside the Canvas — the r3f pump drives
 * the board until `createEngineLoop` takes over, so priority order against
 * unconverted subscribers is preserved.
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
  useLayoutEffect(
    () => joinFrameTask(priority, (state, delta) => ref.current(state, delta)),
    [priority],
  );
}
