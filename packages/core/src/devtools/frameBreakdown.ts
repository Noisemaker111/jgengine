/**
 * Where each frame goes: the record of one frame (CPU per system, GPU per render pass, draws, shader
 * compiles, uploads, heap) and the summary of a window of them (percentiles, the costliest systems,
 * passes, objects and materials, and every hitch with what caused it). This file is the arithmetic;
 * `frameBreakdown.draw.ts` fills the records from a live renderer.
 */

/** A frame slower than this is a hitch: two frames missed at 60 Hz. */
export const HITCH_MS = 33;

/** One frame, as the hooks saw it. GPU times arrive a few frames late; `gpu` is null until they do. */
export interface FrameBreakdownRecord {
  /** Time since the previous frame started (the frame interval the player sees). */
  intervalMs: number;
  /** Main-thread work: from the first frame callback to the end of the last render call. */
  workMs: number;
  /** CPU milliseconds by system: sim phases and stages, frame callbacks, render submission, passes. */
  cpu: Record<string, number>;
  /** GPU milliseconds by render pass (shadow, main, each post pass); null while unresolved or unsupported. */
  gpu: Record<string, number> | null;
  draws: number;
  triangles: number;
  /** Shader programs linked this frame, and the milliseconds the main thread spent compiling and linking. */
  compiles: number;
  compileMs: number;
  /** Texture and buffer uploads this frame: calls, bytes and main-thread milliseconds. */
  uploads: number;
  uploadBytes: number;
  uploadMs: number;
  /** JS heap in MB at the end of the frame, and how much it dropped since the last frame (a collection). */
  heapMb: number | null;
  heapDropMb: number;
}

/** One object or material's share of the draws: totals while gathering, per-frame averages in a summary. */
export interface DrawCost {
  label: string;
  draws: number;
  triangles: number;
  /** Main-thread milliseconds spent submitting its draws (state changes, uniforms, the draw call). */
  cpuMs: number;
  /** The pass its draws were mostly in (shadow, main, a post pass). */
  pass: string;
}

/** A frame over {@link HITCH_MS}, with the cause read from what happened inside it. */
export interface Hitch {
  /** Seconds since the window started. */
  atS: number;
  ms: number;
  cause: "compile" | "upload" | "gc" | "system" | "gpu" | "other";
  detail: string;
}

/** Percentiles of one series. */
export interface Spread {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}

/** A named cost over the window: its average per frame and its 95th percentile. */
export interface NamedCost {
  name: string;
  avgMs: number;
  p95Ms: number;
}

/** A window of frames, summarized for a person or a diff. */
export interface FrameBreakdownSummary {
  frames: number;
  seconds: number;
  /** The frame interval: what the player sees. */
  frame: Spread;
  /** Main-thread work per frame: what a frame costs the CPU, whatever the display's refresh. */
  work: Spread;
  /** GPU time per frame over the frames whose timers resolved; null where timer queries are unsupported. */
  gpu: Spread | null;
  cpu: NamedCost[];
  passes: NamedCost[];
  counts: {
    drawsAvg: number;
    drawsMax: number;
    trianglesAvg: number;
    trianglesMax: number;
    programs: number | null;
    compiles: number;
    compileMs: number;
    uploads: number;
    uploadMb: number;
    heapMb: number | null;
    gcMb: number;
  };
  objects: DrawCost[];
  materials: DrawCost[];
  hitches: Hitch[];
}

const round = (value: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/** p50/p95/p99/max/avg of a series; zeros for an empty one. @internal */
export function spread(values: readonly number[]): Spread {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
  return {
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted[sorted.length - 1]!),
    avg: round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}

/** Average and p95 of each named cost across frames; a frame without the name counts as 0. */
function namedCosts(frames: readonly Record<string, number>[], top: number): NamedCost[] {
  const names = new Set<string>();
  for (const frame of frames) for (const name of Object.keys(frame)) names.add(name);
  const costs = [...names].map((name) => {
    const series = frames.map((frame) => frame[name] ?? 0);
    const s = spread(series);
    return { name, avgMs: round(s.avg, 3), p95Ms: round(s.p95, 3) };
  });
  return costs.sort((a, b) => b.avgMs - a.avgMs).slice(0, top);
}

/**
 * What made a slow frame slow, read in order of how sure the signal is: a shader compile or a large
 * upload stalls the main thread outright, a heap drop is a collection, then the costliest system or
 * GPU pass; anything left is outside the game (the browser, the compositor, the OS).
 * @internal
 */
export function hitchCause(record: FrameBreakdownRecord): Pick<Hitch, "cause" | "detail"> {
  if (record.compiles > 0 && record.compileMs >= 2) {
    return { cause: "compile", detail: `${record.compiles} shader program(s) compiled, ${round(record.compileMs, 1)} ms` };
  }
  if (record.uploadMs >= 4 || record.uploadBytes >= 4 * 1024 * 1024) {
    return { cause: "upload", detail: `${record.uploads} upload(s), ${round(record.uploadBytes / 1048576, 1)} MB, ${round(record.uploadMs, 1)} ms` };
  }
  if (record.heapDropMb >= 2) return { cause: "gc", detail: `garbage collection freed ~${round(record.heapDropMb, 1)} MB` };
  const [system, systemMs] = Object.entries(record.cpu).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const [pass, passMs] = Object.entries(record.gpu ?? {}).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (systemMs >= 8 && systemMs >= passMs) return { cause: "system", detail: `${system} ${round(systemMs, 1)} ms on the CPU` };
  if (passMs >= 8) return { cause: "gpu", detail: `${pass} ${round(passMs, 1)} ms on the GPU` };
  if (record.compiles > 0) return { cause: "compile", detail: `${record.compiles} shader program(s) linked` };
  return { cause: "other", detail: `${round(record.intervalMs - record.workMs, 1)} ms outside the game's frame work (browser, compositor, OS)` };
}

/** Summarize a window of frames plus the draw costs gathered over it. @internal */
export function summarizeBreakdown(
  records: readonly FrameBreakdownRecord[],
  draws: { objects: readonly DrawCost[]; materials: readonly DrawCost[] },
  options: { programs?: number | null; top?: number; hitches?: number } = {},
): FrameBreakdownSummary {
  const top = options.top ?? 12;
  const resolved = records.filter((record) => record.gpu !== null);
  const gpuTotals = resolved.map((record) => Object.values(record.gpu!).reduce((sum, ms) => sum + ms, 0));
  let elapsed = 0;
  const hitches: Hitch[] = [];
  for (const record of records) {
    elapsed += record.intervalMs;
    if (record.intervalMs > HITCH_MS) hitches.push({ atS: round(elapsed / 1000, 2), ms: round(record.intervalMs, 1), ...hitchCause(record) });
  }
  const heaps = records.map((record) => record.heapMb).filter((mb): mb is number => mb !== null);
  const byCost = (a: DrawCost, b: DrawCost) => b.cpuMs - a.cpuMs || b.triangles - a.triangles;
  const n = Math.max(1, records.length);
  const perFrame = (cost: DrawCost): DrawCost => ({ ...cost, draws: round(cost.draws / n, 1), triangles: Math.round(cost.triangles / n), cpuMs: round(cost.cpuMs / n, 3) });
  return {
    frames: records.length,
    seconds: round(elapsed / 1000, 1),
    frame: spread(records.map((record) => record.intervalMs)),
    work: spread(records.map((record) => record.workMs)),
    gpu: resolved.length === 0 ? null : spread(gpuTotals),
    cpu: namedCosts(records.map((record) => record.cpu), top),
    passes: namedCosts(resolved.map((record) => record.gpu!), top),
    counts: {
      drawsAvg: round(records.reduce((sum, record) => sum + record.draws, 0) / Math.max(1, records.length), 1),
      drawsMax: records.reduce((max, record) => Math.max(max, record.draws), 0),
      trianglesAvg: Math.round(records.reduce((sum, record) => sum + record.triangles, 0) / Math.max(1, records.length)),
      trianglesMax: records.reduce((max, record) => Math.max(max, record.triangles), 0),
      programs: options.programs ?? null,
      compiles: records.reduce((sum, record) => sum + record.compiles, 0),
      compileMs: round(records.reduce((sum, record) => sum + record.compileMs, 0), 1),
      uploads: records.reduce((sum, record) => sum + record.uploads, 0),
      uploadMb: round(records.reduce((sum, record) => sum + record.uploadBytes, 0) / 1048576, 1),
      heapMb: heaps.length === 0 ? null : round(heaps[heaps.length - 1]!, 1),
      gcMb: round(records.reduce((sum, record) => sum + record.heapDropMb, 0), 1),
    },
    objects: [...draws.objects].sort(byCost).slice(0, top).map(perFrame),
    materials: [...draws.materials].sort(byCost).slice(0, top).map(perFrame),
    hitches: hitches.sort((a, b) => b.ms - a.ms).slice(0, options.hitches ?? 20),
  };
}

/** Frames per second a frame time allows, rounded; 0 for none. @internal */
export function fpsAt(ms: number): number {
  return ms > 0 ? Math.round(1000 / ms) : 0;
}

/**
 * The short text a person reads: frame spread, the cost per frame against 60 and 144 Hz, the top CPU
 * systems and GPU passes, counts, the costliest objects and materials, and the worst hitches.
 * @internal
 */
export function renderBreakdownText(summary: FrameBreakdownSummary, title: string): string {
  const cost = Math.max(summary.work.p50, summary.gpu?.p50 ?? 0);
  const cost95 = Math.max(summary.work.p95, summary.gpu?.p95 ?? 0);
  const ms = (value: number) => `${value.toFixed(2)} ms`;
  const lines = [
    `${title}: ${summary.frames} frames over ${summary.seconds} s`,
    `frame   p50 ${ms(summary.frame.p50)}  p95 ${ms(summary.frame.p95)}  p99 ${ms(summary.frame.p99)}  max ${ms(summary.frame.max)}  (${fpsAt(summary.frame.p50)} fps)`,
    `cpu     p50 ${ms(summary.work.p50)}  p95 ${ms(summary.work.p95)}   main-thread work per frame`,
    summary.gpu === null
      ? "gpu     timer queries unsupported here"
      : `gpu     p50 ${ms(summary.gpu.p50)}  p95 ${ms(summary.gpu.p95)}`,
    `cost    p50 ${ms(cost)} -> ${fpsAt(cost)} fps possible; p95 ${ms(cost95)}. 60 Hz needs 16.67 ms, 144 Hz needs 6.94 ms` +
      (cost95 <= 6.94 ? " (144 ok)" : ` (${ms(cost95 - 6.94)} over 144)`),
    "",
    "top cpu (avg / p95 per frame):",
    ...summary.cpu.slice(0, 8).map((entry) => `  ${entry.name.padEnd(40)} ${entry.avgMs.toFixed(2).padStart(7)} / ${entry.p95Ms.toFixed(2)}`),
    ...(summary.passes.length === 0 ? [] : ["top gpu passes (avg / p95):", ...summary.passes.slice(0, 8).map((entry) => `  ${entry.name.padEnd(40)} ${entry.avgMs.toFixed(2).padStart(7)} / ${entry.p95Ms.toFixed(2)}`)]),
    `draws ${summary.counts.drawsAvg} avg (${summary.counts.drawsMax} max), triangles ${summary.counts.trianglesAvg} avg, programs ${summary.counts.programs ?? "?"}, ` +
      `compiles ${summary.counts.compiles} (${summary.counts.compileMs} ms), uploads ${summary.counts.uploads} (${summary.counts.uploadMb} MB), heap ${summary.counts.heapMb ?? "?"} MB, gc ~${summary.counts.gcMb} MB`,
    "top objects per frame (submit ms, draws, triangles, pass):",
    ...summary.objects.slice(0, 5).map((entry) => `  ${entry.label.padEnd(40)} ${entry.cpuMs.toFixed(3).padStart(7)} ms ${String(entry.draws).padStart(6)} ${entry.triangles} [${entry.pass}]`),
    "top materials per frame:",
    ...summary.materials.slice(0, 5).map((entry) => `  ${entry.label.padEnd(40)} ${entry.cpuMs.toFixed(3).padStart(7)} ms ${String(entry.draws).padStart(6)} ${entry.triangles} [${entry.pass}]`),
    summary.hitches.length === 0 ? "hitches: none over 33 ms" : `hitches over ${HITCH_MS} ms: ${summary.hitches.length}${summary.hitches.length >= 20 ? "+" : ""}`,
    ...summary.hitches.slice(0, 6).map((hitch) => `  ${hitch.atS.toFixed(2).padStart(6)} s ${hitch.ms.toFixed(1).padStart(6)} ms  ${hitch.cause}: ${hitch.detail}`),
  ];
  return lines.join("\n");
}
