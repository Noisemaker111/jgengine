import { useFrame, useThree } from "@react-three/fiber";
import { memo, useRef } from "react";

import { editorPerfMarks } from "./perfMarks";
import type { EditorHostApi } from "./session";

const SAMPLE_WINDOW_MS = 500;

/** In-canvas frame counter: publishes fps/draw-call samples to the editor host every 500ms. */
export const PerfProbe = memo(function PerfProbe({ api }: { api: EditorHostApi }) {
  const gl = useThree((state) => state.gl);
  const framesRef = useRef(0);
  const windowStartRef = useRef(0);

  useFrame(() => {
    const now = performance.now();
    if (windowStartRef.current === 0) windowStartRef.current = now;
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
      raycastMs: authoring.raycastMs,
      rebuildMs: authoring.rebuildMs,
      authoringMs: authoring.authoringMs,
    });
    framesRef.current = 0;
    windowStartRef.current = now;
  });

  return null;
});
