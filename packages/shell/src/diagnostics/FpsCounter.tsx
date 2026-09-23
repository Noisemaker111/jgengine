import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type ReactElement } from "react";

/** Mutable frame tally shared between the in-Canvas probe and the DOM readout. */
export interface FrameTally {
  frames: number;
}

/** Counts rendered frames. Mount inside the Canvas. @internal */
export function FpsProbe({ tally }: { tally: FrameTally }): null {
  useFrame(() => {
    tally.frames += 1;
  });
  return null;
}

/**
 * Player-facing frames-per-second readout, sampled twice a second from rendered frames (not
 * display refreshes), so it reflects the frame-rate limit and GPU load.
 * @internal shell-internal; shown by the `graphics.showFps` setting.
 */
export function FpsCounter({ tally }: { tally: FrameTally }): ReactElement {
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let last = performance.now();
    tally.frames = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      const fps = (tally.frames * 1000) / Math.max(1, now - last);
      tally.frames = 0;
      last = now;
      if (label.current !== null) label.current.textContent = `${fps < 10 ? fps.toFixed(1) : Math.round(fps)} FPS`;
    }, 500);
    return () => clearInterval(timer);
  }, [tally]);
  return (
    <div className="pointer-events-none absolute bottom-1 right-1 z-50 rounded bg-black/60 px-2 py-0.5 font-mono text-xs tabular-nums text-emerald-300">
      <span ref={label}>-- FPS</span>
    </div>
  );
}
