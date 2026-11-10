/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect } from "@jgengine/core/ui/jsx";

import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { paceFrame } from "@jgengine/core/settings/frameRateLimit";
import { useCanvasCovered } from "@jgengine/core/ui/canvasCover.view";

/**
 * Drives the canvas at a capped frame rate. Under the engine loop it hands the cap to
 * `setFpsLimit`, which paces inside the loop and already yields to a canvas cover. Under r3f
 * (`frameloop="never"`) it runs its own requestAnimationFrame loop and advances on the refreshes
 * `paceFrame` admits, so simulation, frame tasks and rendering all run at the cap with correct
 * deltas. Under a canvas cover the r3f path advances nothing, so a covered canvas draws no frames
 * even at a cap.
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
    // R3F's "never" mode reads the timestamp as seconds on its own clock; continue that clock.
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
      // Hand the clock back to R3F's own loop in milliseconds so its next delta is one frame.
      clock.oldTime = performance.now();
    };
  }, [fps, covered, host]);
  return null;
}
