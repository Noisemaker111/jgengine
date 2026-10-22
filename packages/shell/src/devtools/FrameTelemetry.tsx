import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

import type { PerfQuality } from "@jgengine/core/devtools/devtools";
import { attachGlCounters, installFrameTelemetry, type GlCounterTotals } from "./frameSampler";

/**
 * Mounts the in-page frame sampler for the live 3D scene: it wraps this renderer's
 * context for GPU-object counts, reads renderer and scene numbers on demand, and
 * publishes `window.__JG.report()`. Dev-only — the sampler refuses to install in a
 * production build, so a shipped game pays nothing.
 * @internal
 */
export function FrameTelemetry({ game, quality }: { game: string; quality: PerfQuality }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    let counters: { totals: GlCounterTotals; attached: boolean } = {
      totals: { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 },
      attached: false,
    };
    try {
      counters = attachGlCounters(gl.getContext());
    } catch {
      counters.attached = false;
    }
    const telemetry = installFrameTelemetry({
      game,
      quality: () => quality,
      viewport: () => `${window.innerWidth}x${window.innerHeight}`,
      gpu: () => readGpuLabel(gl.getContext()),
      render: () => ({
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      }),
      scene: () => scene,
      gl: () => counters,
      residentPrograms: () => gl.info.programs?.length ?? null,
    });
    return () => telemetry?.dispose();
  }, [game, quality, gl, scene]);
  return null;
}

function readGpuLabel(context: { getParameter(name: number): unknown; getExtension(name: string): unknown }): string {
  const info = context.getExtension("WEBGL_debug_renderer_info") as {
    UNMASKED_VENDOR_WEBGL: number;
    UNMASKED_RENDERER_WEBGL: number;
  } | null;
  try {
    if (info === null) return String(context.getParameter(0x1f01));
    const vendor = String(context.getParameter(info.UNMASKED_VENDOR_WEBGL));
    const renderer = String(context.getParameter(info.UNMASKED_RENDERER_WEBGL));
    return vendor.length > 0 ? `${vendor} ${renderer}` : renderer;
  } catch {
    return "unknown";
  }
}
