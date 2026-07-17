import { useFrame, useThree } from "@react-three/fiber";
import { memo, useRef } from "react";

import { editorPerfMarks } from "./perfMarks";
import type { EditorHostApi } from "./session";

const SAMPLE_WINDOW_MS = 500;
/** Sum-of-abs delta on camera position/orientation above which a frame counts as camera activity. */
const CAMERA_MOVE_EPSILON = 1e-4;

/** In-canvas frame counter: publishes fps/draw-call samples to the editor host every 500ms. */
export const PerfProbe = memo(function PerfProbe({ api }: { api: EditorHostApi }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const framesRef = useRef(0);
  const windowStartRef = useRef(0);
  const activeRef = useRef(false);
  const lastCamRef = useRef({ px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 });
  const lastDrawRef = useRef(-1);
  const lastTriRef = useRef(-1);

  useFrame(() => {
    const now = performance.now();
    if (windowStartRef.current === 0) windowStartRef.current = now;
    framesRef.current += 1;

    // Detect camera activity frame-to-frame so a single moved frame inside the window still counts.
    const cam = lastCamRef.current;
    const dPos =
      Math.abs(camera.position.x - cam.px) +
      Math.abs(camera.position.y - cam.py) +
      Math.abs(camera.position.z - cam.pz);
    const dRot =
      Math.abs(camera.quaternion.x - cam.qx) +
      Math.abs(camera.quaternion.y - cam.qy) +
      Math.abs(camera.quaternion.z - cam.qz) +
      Math.abs(camera.quaternion.w - cam.qw);
    if (dPos > CAMERA_MOVE_EPSILON || dRot > CAMERA_MOVE_EPSILON) activeRef.current = true;
    cam.px = camera.position.x;
    cam.py = camera.position.y;
    cam.pz = camera.position.z;
    cam.qx = camera.quaternion.x;
    cam.qy = camera.quaternion.y;
    cam.qz = camera.quaternion.z;
    cam.qw = camera.quaternion.w;

    const elapsed = now - windowStartRef.current;
    if (elapsed < SAMPLE_WINDOW_MS) return;
    const fps = (framesRef.current * 1000) / elapsed;
    const authoring = editorPerfMarks.flush();
    const drawCalls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    // Edit activity: viewport raycasts / preview-mesh rebuilds, or the rendered scene changed.
    const sceneChanged =
      lastDrawRef.current >= 0 && (drawCalls !== lastDrawRef.current || triangles !== lastTriRef.current);
    const active = activeRef.current || authoring.authoringMs > 0 || sceneChanged;
    lastDrawRef.current = drawCalls;
    lastTriRef.current = triangles;
    api.setPerf({
      fps: Math.round(fps * 10) / 10,
      frameMs: Math.round((elapsed / framesRef.current) * 100) / 100,
      drawCalls,
      triangles,
      sampledAt: now,
      active,
      raycastMs: authoring.raycastMs,
      rebuildMs: authoring.rebuildMs,
      authoringMs: authoring.authoringMs,
    });
    framesRef.current = 0;
    windowStartRef.current = now;
    activeRef.current = false;
  });

  return null;
});
