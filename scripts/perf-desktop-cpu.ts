// The sampled main-thread profile of a production desktop build, read by layer the way
// `perf fps-gap` reads the dev server's: every node's generated position is mapped through the
// build's private source maps back to its source file, so React, react-three-fiber, three.js and
// the engine's own code can be told apart inside the minified bundle.
import { SourceMap } from "node:module";

import type { CdpSession } from "./browser-lib";
import { profileLayerOf, type ProfileLayer } from "./perf-fps-gap";
import type { RawProfile } from "./perf-play";

/** The call frame a CPU profile node carries; `scriptId` selects its private source map. */
interface ProfileCallFrame {
  functionName: string;
  scriptId?: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface DesktopCpuProfile {
  /** Self time per layer over the profiled wall clock, biggest first (same shape as fps-gap's). */
  layers: ProfileLayer[];
  /** Share of sampled time in scripts no private map could name, so a thin table is not mistaken for a clean one. */
  unmappedPct: number;
}

const SAMPLING_INTERVAL_US = 200;

/**
 * Sample the page's CPU for `seconds` while it plays, then fold the profile into layer shares.
 * `privateMap` is perf-desktop's reader for the build's private maps: it answers a script's map
 * JSON by script id, or throws/returns null when the script has none.
 */
export async function sampleDesktopCpuLayers(
  session: CdpSession,
  privateMap: (scriptId: string) => Promise<string | null>,
  seconds: number,
): Promise<DesktopCpuProfile> {
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: SAMPLING_INTERVAL_US });
  await session.send("Profiler.start");
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  const stopped = await session.send("Profiler.stop");
  return foldDesktopCpuLayers(session, stopped["profile"] as RawProfile, privateMap);
}

/**
 * Fold a finished CPU profile into layer shares. The mapping reads script sources and map files,
 * so it runs after the profiled window closed: that work must not bill the game it measures.
 */
export async function foldDesktopCpuLayers(
  session: CdpSession,
  profile: RawProfile,
  privateMap: (scriptId: string) => Promise<string | null>,
): Promise<DesktopCpuProfile> {
  await session.send("Debugger.enable");
  try {
    const maps = new Map<string, SourceMap | null>();
    const scriptIds = new Set<string>();
    for (const node of profile.nodes) {
      const frame: ProfileCallFrame = node.callFrame;
      if (typeof frame.scriptId === "string" && frame.scriptId !== "") scriptIds.add(frame.scriptId);
    }
    await Promise.all([...scriptIds].map(async (scriptId) => {
      let map: SourceMap | null = null;
      try {
        const raw = await privateMap(scriptId);
        if (raw !== null) map = new SourceMap(JSON.parse(raw));
      } catch { /* a script with no private map keeps its generated location */ }
      maps.set(scriptId, map);
    }));

    const layerById = new Map<number, string>();
    const unmappedIds = new Set<number>();
    for (const node of profile.nodes) {
      const frame: ProfileCallFrame = node.callFrame;
      let url = frame.url;
      let mapped = false;
      if (frame.url !== "" && typeof frame.scriptId === "string") {
        const entry = maps.get(frame.scriptId)?.findEntry(frame.lineNumber, frame.columnNumber);
        const source = entry !== undefined && "originalSource" in entry && typeof entry.originalSource === "string" ? entry.originalSource : undefined;
        if (source !== undefined) {
          url = source;
          mapped = true;
        }
      }
      if (frame.url !== "" && !mapped) unmappedIds.add(node.id);
      layerById.set(node.id, profileLayerOf({ callFrame: { functionName: frame.functionName, url, lineNumber: frame.lineNumber, columnNumber: frame.columnNumber } }));
    }

    const totals = new Map<string, number>();
    let all = 0;
    let unmapped = 0;
    profile.samples.forEach((id, index) => {
      const us = profile.timeDeltas[index] ?? 0;
      all += us;
      totals.set(layerById.get(id) ?? "other scripts", (totals.get(layerById.get(id) ?? "other scripts") ?? 0) + us);
      if (unmappedIds.has(id)) unmapped += us;
    });
    if (all <= 0) return { layers: [], unmappedPct: 0 };
    return {
      layers: [...totals]
        .map(([layer, us]) => ({ layer, pct: Math.round((us / all) * 1000) / 10 }))
        .sort((a, b) => b.pct - a.pct),
      unmappedPct: Math.round((unmapped / all) * 1000) / 10,
    };
  } finally {
    await session.send("Debugger.disable").catch(() => {});
  }
}
