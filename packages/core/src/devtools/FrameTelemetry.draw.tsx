/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import type * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { devtools, type PerfQuality } from "@jgengine/core/devtools/devtools";
import { readUrlParam } from "@jgengine/core/devtools/urlFlags";
import {
  attachGlCounters,
  frameTelemetryMode,
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
 * Draw-side form of {@link FrameTelemetry}: installs the in-page frame sampler for the live 3D
 * scene — it wraps this renderer's context for GPU-object counts, reads renderer and scene numbers
 * on demand, and publishes `window.__JG.report()`, plus the per-frame breakdown
 * (`window.__jgFrameBreakdown`: CPU per system, GPU per pass, draws, compiles, uploads, hitches).
 * It normally installs only when the dev server answers its report route; `?telemetry=local`
 * opts a shipped game into local-only reporting. Rebuilds when `game`/`quality` change, like the
 * old effect deps.
 * @internal
 */
export function frameTelemetryDraw(getProps: () => { game: string; quality: PerfQuality }): EngineDraw {
  let gl: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let generation = 0;
  let telemetry: FrameSampler | null = null;
  let breakdown: FrameBreakdown | null = null;
  let installedDeps: readonly unknown[] | null = null;

  const install = () => {
    const { game, quality } = getProps();
    if (gl === null || scene === null) return;
    const renderer = gl;
    const target = scene;
    const deps: readonly unknown[] = [game, quality];
    const prev = installedDeps;
    if (prev !== null && prev.length === deps.length && deps.every((dep, index) => dep === prev[index])) return;
    installedDeps = deps;
    const gen = ++generation;
    telemetry?.dispose();
    telemetry = null;
    breakdown?.dispose();
    breakdown = null;
    void frameTelemetryMode(readUrlParam(TELEMETRY_FLAG), () => probeReportRoute(undefined, reportGameId(game))).then((mode) => {
      if (gen !== generation || mode === "off") return;
      let counters: { totals: GlCounterTotals; attached: boolean } = {
        totals: { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 },
        attached: false,
      };
      try {
        counters = attachGlCounters(renderer.getContext());
      } catch {
        counters.attached = false;
      }
      try {
        breakdown = installFrameBreakdown(renderer);
      } catch (error) {
        console.warn(`[jgengine:perf] frame breakdown did not install: ${String(error)}`);
      }
      // Asked once: the GPU does not change, and the unmasked renderer query can stall the frame it runs
      // in for tens of milliseconds while the driver drains its queue; the report asks every second.
      const gpuLabel = readGpuLabel(renderer.getContext());
      telemetry = installFrameTelemetry({
        game,
        push: mode !== "local",
        quality: () => getProps().quality,
        viewport: () => `${window.innerWidth}x${window.innerHeight}`,
        gpu: () => gpuLabel,
        render: () => devtools.render.latest() ?? {
          // Falling back to the live counter is a mid-frame read: it holds the passes drawn so far.
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
        scene: () => target,
        gl: () => counters,
        residentPrograms: () => renderer.info.programs?.length ?? null,
      });
    });
  };

  return {
    mount(state: EngineFrameState) {
      gl = state.gl;
      scene = state.rootScene ?? state.scene;
      install();
    },
    update() {
      install();
    },
    dispose() {
      generation++;
      telemetry?.dispose();
      telemetry = null;
      breakdown?.dispose();
      breakdown = null;
      gl = null;
      scene = null;
      installedDeps = null;
    },
  };
}

/**
 * Mounts the in-page frame sampler for the live 3D scene: it wraps this renderer's
 * context for GPU-object counts, reads renderer and scene numbers on demand, and
 * publishes `window.__JG.report()`, plus the per-frame breakdown (`window.__jgFrameBreakdown`: CPU
 * per system, GPU per pass, draws, compiles, uploads, hitches). It normally installs only when the
 * dev server answers its report route; `?telemetry=local` opts a shipped game into local-only reporting.
 * @internal
 */
export function FrameTelemetry(props: { game: string; quality: PerfQuality }) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => frameTelemetryDraw(() => latest.current), []);
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
