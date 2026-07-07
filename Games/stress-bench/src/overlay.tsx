import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import { InstancedBodies } from "@jgengine/shell/world/InstancedBodies";
import type { PhysicsBounds } from "@jgengine/core/physics/physicsWorld";

import { benchStats, useBenchControls } from "./benchState";

const FRAME_WINDOW = 240;

function BoxWireframe({ bounds }: { bounds: PhysicsBounds }) {
  const geometry = useMemo(() => {
    const w = bounds.max[0] - bounds.min[0];
    const h = bounds.max[1] - bounds.min[1];
    const d = bounds.max[2] - bounds.min[2];
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  }, [bounds]);
  const cx = (bounds.max[0] + bounds.min[0]) / 2;
  const cy = (bounds.max[1] + bounds.min[1]) / 2;
  const cz = (bounds.max[2] + bounds.min[2]) / 2;
  return (
    <lineSegments geometry={geometry} position={[cx, cy, cz]}>
      <lineBasicMaterial color="#5b6472" />
    </lineSegments>
  );
}

const frameTimes = new Float32Array(FRAME_WINDOW);
let frameCursor = 0;
let frameFilled = 0;
let sinceRecompute = 0;

function BenchProbe() {
  const gl = useThree((state) => state.gl);
  useFrame((_, delta) => {
    const frameMs = delta * 1000;
    frameTimes[frameCursor] = frameMs;
    frameCursor = (frameCursor + 1) % FRAME_WINDOW;
    if (frameFilled < FRAME_WINDOW) frameFilled += 1;

    const instantFps = frameMs > 0 ? 1000 / frameMs : 0;
    benchStats.fps = benchStats.fps === 0 ? instantFps : benchStats.fps * 0.9 + instantFps * 0.1;
    benchStats.frameMs = frameMs;
    benchStats.renderMs = Math.max(frameMs - benchStats.physicsMs, 0);
    benchStats.drawCalls = gl.info.render.calls;

    sinceRecompute += 1;
    if (sinceRecompute >= 15 && frameFilled > 20) {
      sinceRecompute = 0;
      const sorted = Float32Array.prototype.slice.call(frameTimes, 0, frameFilled).sort();
      const idx = Math.min(frameFilled - 1, Math.floor(frameFilled * 0.99));
      const slow = sorted[idx]!;
      benchStats.fpsLow1 = slow > 0 ? 1000 / slow : 0;
      benchStats.settled = benchStats.awake <= Math.max(4, benchStats.total * 0.001);
    }
  });
  return null;
}

export function BenchWorldOverlay() {
  const { tint, epoch, world } = useBenchControls();
  if (world === null) return null;
  return (
    <>
      <BoxWireframe bounds={world.bounds} />
      <InstancedBodies world={world.world} debugTint={tint} baseColors={world.baseColors} epoch={epoch} />
      <BenchProbe />
    </>
  );
}
