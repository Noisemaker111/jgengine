import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { paceFrame } from "@jgengine/core/settings/frameRateLimit";

/**
 * Drives the Canvas at a capped frame rate. Mount only with `frameloop="never"`: it runs its
 * own requestAnimationFrame loop and advances R3F on the refreshes `paceFrame` admits, so
 * simulation, useFrame and rendering all run at the cap with correct deltas.
 * @internal shell-internal; driven by the player's frame-rate limit setting.
 */
export function FrameRateLimiter({ fps }: { fps: number }): null {
  const advance = useThree((state) => state.advance);
  const get = useThree((state) => state.get);
  useEffect(() => {
    if (fps <= 0) return;
    // R3F's "never" mode reads the timestamp as seconds on its own clock; continue that clock.
    const base = get().clock.elapsedTime;
    let start: number | null = null;
    let anchor = 0;
    let frame = requestAnimationFrame(function tick(now) {
      frame = requestAnimationFrame(tick);
      if (start === null) {
        start = now;
        anchor = now;
      }
      const next = paceFrame(now, anchor, fps);
      if (next === null) return;
      anchor = next;
      advance(base + (now - start) / 1000, true);
    });
    return () => {
      cancelAnimationFrame(frame);
      // Hand the clock back to R3F's own loop in milliseconds so its next delta is one frame.
      get().clock.oldTime = performance.now();
    };
  }, [fps, advance, get]);
  return null;
}
