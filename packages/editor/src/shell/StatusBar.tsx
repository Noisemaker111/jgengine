import { useEffect, useState } from "react";

import { classifyEditorPerf } from "../perfPill";
import type { EditorHostApi, EditorPerfSample } from "../session";
import type { PerfHistoryStore } from "./perfHistory";
import { BORDER, NUMERIC } from "./theme";

const PERF_POLL_MS = 500;

/** Shared editor-host perf poll: samples on an interval and feeds the profiler history. */
export function usePerfSample(api: EditorHostApi, history?: PerfHistoryStore): EditorPerfSample | null {
  const [sample, setSample] = useState<EditorPerfSample | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = api.getPerf();
      setSample(next);
      if (next !== null && history !== undefined) history.push(next);
    }, PERF_POLL_MS);
    return () => clearInterval(timer);
  }, [api, history]);
  return sample;
}

/** Compact triangle-count formatting (1.2M / 340k). */
export function formatTriangles(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}k`;
  return String(count);
}

const PERF_TONE_CLASS = {
  idle: "text-neutral-500",
  healthy: "text-emerald-400",
  busy: "text-rose-400",
} as const;

/**
 * Bottom status strip: readiness, scene stats, live perf pill, autosave state, and camera hints.
 * Owns its own perf poll (and the profiler history feed) so the 500ms tick never rerenders the shell.
 */
export function StatusBar({
  api,
  history,
  objects,
  foliage,
  selectionCount,
  autosave,
}: {
  api: EditorHostApi;
  history: PerfHistoryStore;
  objects: number;
  foliage: number;
  selectionCount: number;
  autosave: boolean;
}) {
  const perf = usePerfSample(api, history);
  const tone = perf === null ? "idle" : classifyEditorPerf(perf);
  return (
    <footer
      className={`pointer-events-auto flex h-6 shrink-0 items-center gap-3 border-t ${BORDER} bg-[#0e1014] px-2.5 text-[10px] text-neutral-500`}
    >
      <span className="flex items-center gap-1.5 text-neutral-400">
        <span className={`h-1.5 w-1.5 rounded-full ${tone === "busy" ? "bg-rose-400" : "bg-emerald-500"}`} />
        Ready
      </span>
      <span className={NUMERIC}>{objects} objects</span>
      {foliage > 0 ? <span className={NUMERIC}>≈{formatTriangles(foliage)} foliage</span> : null}
      {selectionCount > 0 ? <span className={`${NUMERIC} text-cyan-300/80`}>{selectionCount} selected</span> : null}
      {perf !== null ? (
        <span className={`${NUMERIC} ${PERF_TONE_CLASS[tone]}`}>
          {tone === "idle" ? "idle" : `${perf.fps.toFixed(0)} fps`}
          {tone === "idle" && perf.drawCalls === 0 ? "" : ` · ${perf.drawCalls} draws · ${formatTriangles(perf.triangles)} tris`}
        </span>
      ) : null}
      <span className="ml-auto hidden lg:inline">RMB orbit · MMB pan · W/E/R gizmo · F frame · ? shortcuts</span>
      <span className="flex items-center gap-1.5">
        Draft autosave
        <span className={autosave ? "text-emerald-400" : "text-neutral-600"}>{autosave ? "on" : "off"}</span>
      </span>
    </footer>
  );
}
