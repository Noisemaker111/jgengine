import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { WebGLRenderer } from "three";

import {
  recordPerformanceFrame,
  refreshPerformanceRendererStats,
  type PerformanceRenderStats,
} from "@/runtime/runtimePerformanceDiagnostics";
import {
  beginProfilerFrame,
  endProfilerFrame,
  PROFILE_SECTION,
  recordProfileSection,
} from "@/runtime/runtimePerformanceProfiler";

function readRendererStats(gl: WebGLRenderer): PerformanceRenderStats {
  const { render, memory } = gl.info;
  return {
    triangles: render.triangles,
    calls: render.calls,
    points: render.points,
    lines: render.lines,
    geometries: memory.geometries,
    textures: memory.textures,
  };
}

/** Samples frame timing, profiler sections, and renderer stats from inside the R3F canvas. */
export function PerformanceDiagnosticSampler() {
  const { gl } = useThree();
  const frameCounterRef = useRef(0);
  const frameDeltaMsRef = useRef(0);

  useEffect(() => {
    const originalRender = gl.render.bind(gl);
    gl.render = (...args) => {
      const startedAt = performance.now();
      const result = originalRender(...args);
      recordProfileSection(PROFILE_SECTION.webglRender, performance.now() - startedAt);
      endProfilerFrame(frameDeltaMsRef.current);
      recordPerformanceFrame(frameDeltaMsRef.current);
      return result;
    };
    return () => {
      gl.render = originalRender;
    };
  }, [gl]);

  useFrame((_, delta) => {
    frameDeltaMsRef.current = delta * 1000;
    beginProfilerFrame(frameDeltaMsRef.current);
  }, -10_000);

  useFrame(() => {
    frameCounterRef.current += 1;
    if (frameCounterRef.current % 30 !== 0) return;
    refreshPerformanceRendererStats(readRendererStats(gl));
  });

  return null;
}