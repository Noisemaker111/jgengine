import { useFrame, useThree } from "@react-three/fiber";
import { memo, useRef } from "react";

import { editorPerfMarks } from "./perfMarks";
import type { EditorHostApi } from "./session";

const SAMPLE_WINDOW_MS = 500;
/**
 * Longest gap between two frames that still counts as "the loop is actively pumping". Above it the
 * editor is render-on-demand (nothing moving) and the window's fps reflects throttling, not draw
 * cost — ~7fps instantaneous. Interactive stutter (orbit/sculpt) stays well under this even when the
 * frame is genuinely slow, so the real red-fps cue survives.
 */
const IDLE_FRAME_GAP_MS = 140;

/** In-canvas frame counter: publishes fps/draw-call samples to the editor host every 500ms. */
export const PerfProbe = memo(function PerfProbe({ api }: { api: EditorHostApi }) {
  const gl = useThree((state) => state.gl);
  const framesRef = useRef(0);
  const windowStartRef = useRef(0);
  const lastFrameRef = useRef(0);
  const maxGapRef = useRef(0);

  useFrame(() => {
    const now = performance.now();
    if (windowStartRef.current === 0) windowStartRef.current = now;
    if (lastFrameRef.current !== 0) {
      maxGapRef.current = Math.max(maxGapRef.current, now - lastFrameRef.current);
    }
    lastFrameRef.current = now;
    framesRef.current += 1;
    const elapsed = now - windowStartRef.current;
    if (elapsed < SAMPLE_WINDOW_MS) return;
    const fps = (framesRef.current * 1000) / elapsed;
    const authoring = editorPerfMarks.flush();
    api.setPerf({
      fps: Math.round(fps * 10) / 10,
      frameMs: Math.round((elapsed / framesRef.current) * 100) / 100,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      sampledAt: now,
      idle: maxGapRef.current > IDLE_FRAME_GAP_MS,
      raycastMs: authoring.raycastMs,
      rebuildMs: authoring.rebuildMs,
      authoringMs: authoring.authoringMs,
    });
    framesRef.current = 0;
    windowStartRef.current = now;
    maxGapRef.current = 0;
  });

  return null;
});
