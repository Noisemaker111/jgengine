import { useEffect } from "react";
import { useStore, useThree } from "@react-three/fiber";

import { devtools, type PerfQuality } from "@jgengine/core/devtools/devtools";
import { readUrlParam } from "@jgengine/core/devtools/urlFlags";
import {
  attachGlCounters,
  installFrameTelemetry,
  probeReportRoute,
  reportGameId,
  TELEMETRY_FLAG,
  type FrameSampler,
  type GlCounterTotals,
} from "./frameSampler.view";
import type { FrameBreakdown } from "./frameBreakdown";
import { installFrameBreakdown } from "./frameBreakdown.draw";

/**
 * Mounts the in-page frame sampler for the live 3D scene: it wraps this renderer's
 * context for GPU-object counts, reads renderer and scene numbers on demand, and
 * publishes `window.__JG.report()`, plus the per-frame breakdown (`window.__jgFrameBreakdown`: CPU
 * per system, GPU per pass, draws, compiles, uploads, hitches). It installs only when the dev server answers its
 * report route, so a shipped game pays for one probe request and nothing else.
 * @internal
 */
export function FrameTelemetry({ game, quality }: { game: string; quality: PerfQuality }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const store = useStore();
  useEffect(() => {
    if ((readUrlParam(TELEMETRY_FLAG) ?? "").toLowerCase() === "off") return;
    let active = true;
    let telemetry: FrameSampler | null = null;
    let breakdown: FrameBreakdown | null = null;
    void probeReportRoute(undefined, reportGameId(game)).then((available) => {
      if (!active || !available) return;
      let counters: { totals: GlCounterTotals; attached: boolean } = {
        totals: { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 },
        attached: false,
      };
      try {
        counters = attachGlCounters(gl.getContext());
      } catch {
        counters.attached = false;
      }
      try {
        breakdown = installFrameBreakdown(gl, store);
      } catch (error) {
        console.warn(`[jgengine:perf] frame breakdown did not install: ${String(error)}`);
      }
      // Asked once: the GPU does not change, and the unmasked renderer query can stall the frame it runs
      // in for tens of milliseconds while the driver drains its queue; the report asks every second.
      const gpuLabel = readGpuLabel(gl.getContext());
      telemetry = installFrameTelemetry({
        game,
        quality: () => quality,
        viewport: () => `${window.innerWidth}x${window.innerHeight}`,
        gpu: () => gpuLabel,
        render: () => devtools.render.latest() ?? {
          // Falling back to the live counter is a mid-frame read: it holds the passes drawn so far.
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
        },
        scene: () => scene,
        gl: () => counters,
        residentPrograms: () => gl.info.programs?.length ?? null,
      });
    });
    return () => {
      active = false;
      telemetry?.dispose();
      breakdown?.dispose();
    };
  }, [game, quality, gl, scene, store]);
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
