import { useLayoutEffect, useRef } from "@jgengine/core/ui/jsx";

import { useFrameJoin } from "@jgengine/core/frame/engineHost.draw";
import type { EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

/**
 * A frame callback for per-instance work that many mounted copies share, such as one per prop batch: every
 * copy at one priority runs inside a single frame-board subscription, in the order they joined, and
 * leaves it while `active` is false. The board groups tasks per priority, so a world of a thousand
 * batches with a callback each pays one frame slot, not a thousand. Ordered against the other
 * tasks at the same priority only by when the first copy joined: work that has to run before
 * or after a particular callback takes a priority of its own.
 * @internal
 */
export function useSharedFrame(
  callback: (state: EngineFrameState, delta: number) => void,
  priority = 0,
  active = true,
): void {
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  const joinFrame = useFrameJoin();
  useLayoutEffect(
    () => (active ? joinFrame(priority, (state, delta) => ref.current(state, delta)) : undefined),
    [active, priority],
  );
}
