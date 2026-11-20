/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect } from "@jgengine/core/ui/jsx";

import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { paceFrame } from "@jgengine/core/settings/frameRateLimit";
import { useCanvasCovered } from "@jgengine/core/ui/canvasCover.view";

/**
 * Drives the canvas at a capped frame rate through `setFpsLimit`. Hosts exposing only
 * manual advance use `paceFrame` to admit refreshes with elapsed seconds. A covered canvas
 * draws no frames on either path.
 * @internal shell-internal; driven by the player's frame-rate limit setting.
 */
export function FrameRateLimiter({ fps }: { fps: number }): null {
  const covered = useCanvasCovered();
  const host = useEngineHost();
  useEffect(() => {
    if (host.setFpsLimit !== undefined) {
      host.setFpsLimit(fps);
      return () => host.setFpsLimit?.(0);
    }
    if (fps <= 0 || covered) return;
    // Manual advance takes elapsed seconds on the host's clock.
    const clock = host.frame.clock;
    const base = clock.elapsedTime;
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
      host.advance?.(base + (now - start) / 1000);
    });
    return () => {
      cancelAnimationFrame(frame);
      // Resume the host clock in milliseconds so its next delta is one frame.
      clock.oldTime = performance.now();
    };
  }, [fps, covered, host]);
  return null;
}
