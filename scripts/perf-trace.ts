import { closeSync, openSync, writeSync } from "node:fs";
import type { CdpSession } from "./browser-lib";

/*
 * A Chrome trace of every process over a drive, read against the page's hitch log. The page's own
 * frame breakdown sees only its main thread, so a frame lost to the GPU process (a draw-time shader
 * variant, a big upload, a present that waits) reads there as "outside the game's frame work".
 * The trace names the slice that held each such frame.
 */

/**
 * The GPU service and ANGLE's own slices, and the page's marks: where a draw-time shader variant, a
 * raster program link or a long flush shows. Not "toplevel": every task of every process made a
 * 700 MB trace that took minutes to save on a busy PC.
 */
const CATEGORIES = ["gpu", "gpu.angle", "gpu.service", "viz", "blink.user_timing", "disabled-by-default-gpu.service"];
/** The page mark that ties the hitch log's clock to the trace's. */
export const TRACE_ANCHOR = "jg-hitch-zero";

export async function startTrace(session: CdpSession): Promise<void> {
  await session.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { recordMode: "recordAsMuchAsPossible", includedCategories: CATEGORIES },
  });
}

/** Mark the hitch log's zero in the trace; call right after the breakdown is reset. */
export async function markTraceAnchor(session: CdpSession): Promise<void> {
  await session.evaluate(`performance.mark(${JSON.stringify(TRACE_ANCHOR)})`);
}

/** End the trace and stream it to `out`. */
export async function endTrace(session: CdpSession, out: string): Promise<void> {
  const complete = new Promise<string>((resolve, reject) => {
    const off = session.on("Tracing.tracingComplete", (params) => {
      off();
      const stream = params["stream"];
      if (typeof stream === "string") resolve(stream);
      else reject(new Error("drive: --trace ended without a trace stream"));
    });
  });
  await session.send("Tracing.end");
  const stream = await complete;
  const fd = openSync(out, "w");
  try {
    for (;;) {
      const chunk = await session.send("IO.read", { handle: stream, size: 4 * 1024 * 1024 });
      const data = String(chunk["data"] ?? "");
      writeSync(fd, chunk["base64Encoded"] === true ? Buffer.from(data, "base64") : Buffer.from(data, "utf8"));
      if (chunk["eof"] === true) break;
    }
  } finally {
    closeSync(fd);
    await session.send("IO.close", { handle: stream }).catch(() => {});
  }
}

export interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}

export interface TracedHitch {
  atS: number;
  ms: number;
  /** The longest slice chain on each thread busy for a good part of the frame, longest first. */
  busy: { thread: string; ms: number; chain: string }[];
}

/** Slices shorter than this are never named; the frames worth explaining are 33 ms and up. */
const MIN_SLICE_MS = 8;

/**
 * The events `traceHitches` reads, streamed from a trace file a line at a time: a long drive's trace
 * runs to hundreds of megabytes, and parsing it whole took Bun past 32 GB and crashed it.
 */
export async function readTraceEvents(path: string): Promise<TraceEvent[]> {
  const kept: TraceEvent[] = [];
  const decoder = new TextDecoder();
  let rest = "";
  // Chunks split on newlines by hand: node's readline took two minutes over a 700 MB trace.
  const reader = Bun.file(path).stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = rest + decoder.decode(value, { stream: true });
    const lines = text.split("\n");
    rest = lines.pop() ?? "";
    for (const raw of lines) keepTraceLine(raw, kept);
  }
  keepTraceLine(rest, kept);
  return kept;
}

function keepTraceLine(raw: string, kept: TraceEvent[]): void {
  let line = raw.trimEnd();
  if (line.endsWith(",")) line = line.slice(0, -1);
  if (line.startsWith(TRACE_HEAD)) line = line.slice(TRACE_HEAD.length);
  if (!line.startsWith("{\"")) return;
  // Cheap text tests first: most lines are short slices, and parsing each took minutes.
  const meta = line.includes("\"ph\":\"M\"");
  if (!meta && !line.includes(TRACE_ANCHOR)) {
    const dur = DUR.exec(line);
    if (dur === null || Number(dur[1]) < MIN_SLICE_MS * 1000) return;
  }
  let event: TraceEvent;
  try {
    event = JSON.parse(line) as TraceEvent;
  } catch {
    return;
  }
  if (meta || event.name === TRACE_ANCHOR || (event.ph === "X" && (event.dur ?? 0) >= MIN_SLICE_MS * 1000)) kept.push(event);
}

const TRACE_HEAD = "{\"traceEvents\":[";
const DUR = /"dur":(\d+)/;

/**
 * For each hitch, the threads that were busy through it and what they were running. `atS` is the
 * frame's end in seconds after the anchor mark, as the hitch log records it.
 */
export function traceHitches(events: TraceEvent[], hitches: { atS: number; ms: number }[]): TracedHitch[] {
  const anchor = events.find((event) => event.name === TRACE_ANCHOR && (event.ph === "R" || event.ph === "I" || event.ph === "n" || event.ph === "b" || event.ph === "X"));
  if (anchor === undefined) throw new Error(`drive: --trace found no ${TRACE_ANCHOR} mark in the trace`);
  const names = new Map<string, string>();
  for (const event of events) {
    if (event.ph !== "M") continue;
    const name = event.args?.["name"];
    if (typeof name !== "string") continue;
    if (event.name === "process_name") names.set(`${event.pid}`, name);
    else if (event.name === "thread_name") names.set(`${event.pid}:${event.tid}`, name);
  }
  const slices = events.filter((event) => event.ph === "X" && (event.dur ?? 0) >= MIN_SLICE_MS * 1000).sort((a, b) => a.ts - b.ts);
  return hitches.map((hitch) => {
    const end = anchor.ts + hitch.atS * 1_000_000;
    const start = end - hitch.ms * 1000;
    const byThread = new Map<string, TraceEvent[]>();
    for (const slice of slices) {
      if (slice.ts >= end) break;
      if (slice.ts + (slice.dur ?? 0) <= start) continue;
      const key = `${slice.pid}:${slice.tid}`;
      byThread.set(key, [...(byThread.get(key) ?? []), slice]);
    }
    const busy: TracedHitch["busy"] = [];
    for (const [key, list] of byThread) {
      const overlap = (slice: TraceEvent) => Math.min(end, slice.ts + (slice.dur ?? 0)) - Math.max(start, slice.ts);
      const longest = list.reduce((best, slice) => (overlap(slice) > overlap(best) ? slice : best));
      let top = longest;
      const chain = [top.name];
      const seen = new Set([top]);
      // Step into the longest slice nested inside, so the chain ends at the work, not the task loop.
      // Two slices can span the very same time, so each is visited once.
      for (;;) {
        const outer = top;
        const inner = list.filter((slice) => !seen.has(slice) && slice.ts >= outer.ts && slice.ts + (slice.dur ?? 0) <= outer.ts + (outer.dur ?? 0));
        if (inner.length === 0) break;
        top = inner.reduce((best, slice) => ((slice.dur ?? 0) > (best.dur ?? 0) ? slice : best));
        seen.add(top);
        chain.push(top.name);
      }
      const pid = key.split(":")[0]!;
      busy.push({ thread: `${names.get(pid) ?? `pid ${pid}`} / ${names.get(key) ?? `tid ${key.split(":")[1]}`}`, ms: Math.round(overlap(longest) / 100) / 10, chain: chain.join(" > ") });
    }
    busy.sort((a, b) => b.ms - a.ms);
    return { atS: hitch.atS, ms: hitch.ms, busy: busy.filter((entry) => entry.ms >= hitch.ms / 4).slice(0, 4) };
  });
}

export function renderTracedHitches(traced: TracedHitch[]): string {
  const lines = ["trace: what each process was running through the hitches"];
  for (const hitch of traced) {
    lines.push(`  ${hitch.atS.toFixed(2).padStart(6)} s ${hitch.ms.toFixed(1).padStart(6)} ms${hitch.busy.length === 0 ? "  no thread was busy for a quarter of it" : ""}`);
    for (const entry of hitch.busy) lines.push(`      ${entry.ms.toFixed(1).padStart(6)} ms  ${entry.thread}: ${entry.chain}`);
  }
  return lines.join("\n");
}
