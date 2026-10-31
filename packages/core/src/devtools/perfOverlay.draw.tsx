import { useFrame, useStore, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ReactElement } from "react";

import { devtools } from "@jgengine/core/devtools/devtools";

import type { NamedCost } from "./frameBreakdown";
import { installFrameBreakdown } from "./frameBreakdown.draw";
import { countSceneNodes } from "./frameSampler.view";

/** Frames the FPS graph keeps. */
export const PERF_OVERLAY_FRAMES = 120;
/** Scene nodes are counted at most this often: a traversal walks the whole scene. */
const NODE_COUNT_MS = 1000;
/** Costliest subsystems shown. */
const TOP_SYSTEMS = 4;

/** What the overlay draws, filled in place by {@link PerfOverlayProbe} and read by {@link PerfOverlay}. */
export interface PerfOverlaySample {
  /** Frame intervals in milliseconds, a ring of {@link PERF_OVERLAY_FRAMES}. */
  intervals: Float32Array;
  /** Next write index into `intervals`. */
  head: number;
  frames: number;
  draws: number;
  triangles: number;
  nodes: number | null;
  programs: number | null;
  /** The costliest CPU systems over the last frames, from the frame breakdown. */
  systems: NamedCost[];
}

/** A fresh sample for one overlay. @internal */
export function createPerfOverlaySample(): PerfOverlaySample {
  return { intervals: new Float32Array(PERF_OVERLAY_FRAMES), head: 0, frames: 0, draws: 0, triangles: 0, nodes: null, programs: null, systems: [] };
}

/** Frames per second over the filled part of the ring: frames over the time they took. */
export function overlayFps(sample: PerfOverlaySample): number {
  const count = Math.min(sample.frames, PERF_OVERLAY_FRAMES);
  let total = 0;
  for (let index = 0; index < count; index += 1) total += sample.intervals[index] ?? 0;
  return total <= 0 ? 0 : (count * 1000) / total;
}

/**
 * Samples the live scene for the F3 overlay: frame times, draws, triangles, nodes, linked programs and
 * the costliest subsystems. It installs the frame breakdown while open when the dev telemetry has not,
 * and removes what it installed on close. Mount inside the Canvas. @internal
 */
export function PerfOverlayProbe({ sample }: { sample: PerfOverlaySample }): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const store = useStore();
  const last = useRef<number | null>(null);
  const counted = useRef(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.__jgFrameBreakdown !== undefined) return;
    let owned: ReturnType<typeof installFrameBreakdown> | null = null;
    try {
      owned = installFrameBreakdown(gl, store);
    } catch {
      owned = null;
    }
    return () => {
      // Telemetry may have replaced it since; only take down our own.
      if (owned !== null && window.__jgFrameBreakdown === owned) owned.dispose();
    };
  }, [gl, store]);
  useFrame(() => {
    const now = performance.now();
    if (last.current !== null) {
      sample.intervals[sample.head] = now - last.current;
      sample.head = (sample.head + 1) % PERF_OVERLAY_FRAMES;
      sample.frames += 1;
    }
    last.current = now;
    const render = devtools.render.latest();
    sample.draws = render?.drawCalls ?? gl.info.render.calls;
    sample.triangles = render?.triangles ?? gl.info.render.triangles;
    sample.programs = gl.info.programs?.length ?? null;
    if (now - counted.current >= NODE_COUNT_MS) {
      counted.current = now;
      sample.nodes = countSceneNodes(scene).nodes;
      const breakdown = typeof window === "undefined" ? undefined : window.__jgFrameBreakdown;
      sample.systems = breakdown === undefined ? [] : breakdown.summary({ top: TOP_SYSTEMS, last: 60 }).cpu.slice(0, TOP_SYSTEMS);
    }
  });
  return null;
}

const GRAPH_W = 220;
const GRAPH_H = 48;
/** The graph's top is two 60 fps frames. */
const GRAPH_MS = 33.4;

function drawGraph(canvas: HTMLCanvasElement, sample: PerfOverlaySample): void {
  const context = canvas.getContext("2d");
  if (context === null) return;
  context.clearRect(0, 0, GRAPH_W, GRAPH_H);
  context.fillStyle = "rgba(148, 163, 184, 0.35)";
  context.fillRect(0, GRAPH_H - (16.7 / GRAPH_MS) * GRAPH_H, GRAPH_W, 1);
  const bar = GRAPH_W / PERF_OVERLAY_FRAMES;
  for (let index = 0; index < PERF_OVERLAY_FRAMES; index += 1) {
    const ms = sample.intervals[(sample.head + index) % PERF_OVERLAY_FRAMES] ?? 0;
    if (ms <= 0) continue;
    const height = Math.min(GRAPH_H, (ms / GRAPH_MS) * GRAPH_H);
    context.fillStyle = ms > 33 ? "#f87171" : ms > 17.5 ? "#fbbf24" : "#34d399";
    context.fillRect(index * bar, GRAPH_H - height, Math.max(1, bar - 0.5), height);
  }
}

function overlayText(sample: PerfOverlaySample): string {
  const fps = overlayFps(sample);
  const lines = [
    `${fps < 10 ? fps.toFixed(1) : Math.round(fps)} fps`,
    `draws ${sample.draws}  tris ${Math.round(sample.triangles / 1000)}k`,
    `nodes ${sample.nodes ?? "-"}  programs ${sample.programs ?? "-"}`,
    ...sample.systems.map((system) => `${system.name.slice(0, 22).padEnd(22)} ${system.avgMs.toFixed(2)}ms`),
  ];
  return lines.join("\n");
}

/**
 * The F3 performance overlay every game gets: an FPS graph of the last frames, draws, triangles, scene
 * nodes, linked programs and the costliest subsystems from the devtools frame breakdown. Pair it with
 * {@link PerfOverlayProbe} inside the Canvas, sharing one sample.
 *
 * @capability perf-overlay F3 in-game performance overlay — FPS graph, draws, nodes, programs and the costliest subsystems
 */
export function PerfOverlay({ sample }: { sample: PerfOverlaySample }): ReactElement {
  const graph = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      if (graph.current !== null) drawGraph(graph.current, sample);
      if (text.current !== null) text.current.textContent = overlayText(sample);
    }, 250);
    return () => clearInterval(timer);
  }, [sample]);
  return (
    <div
      data-perf-overlay=""
      role="status"
      aria-label="Performance"
      style={{ position: "absolute", left: 8, top: 8, zIndex: 60, pointerEvents: "none", padding: 8, borderRadius: 6, background: "rgba(2, 6, 23, 0.78)", color: "#e2e8f0", font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      <canvas ref={graph} width={GRAPH_W} height={GRAPH_H} style={{ display: "block", width: GRAPH_W, height: GRAPH_H }} />
      <pre ref={text} style={{ margin: "6px 0 0", whiteSpace: "pre" }}>-- fps</pre>
    </div>
  );
}
