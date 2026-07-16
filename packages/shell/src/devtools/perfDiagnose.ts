import { devtools, LONG_FRAME_MS, type LongFrameEvent } from "@jgengine/core/devtools/devtools";

import { ms } from "./panelAtoms";

const CULPRIT_HINTS: Record<string, string> = {
  "outside-sim": "Cost is outside the sim driver — three.js render, React commit, GPU, GC, or tab throttle.",
  sim: "Sim is slow but no named phase stands out — wrap hot onTick work with measure(\"name\", fn).",
  onTick: "Game loop.onTick is the hotspot — profile inside it with measure(\"physics\"|\"ai\"|…, fn).",
  pose: "Shell movement / collision / voxel step is expensive.",
  actions: "Input → command dispatch / hotbar / interact is expensive.",
  presence: "Multiplayer pose sync is expensive.",
  pickup: "Auto-pickup nearest scan is expensive.",
  "time+input": "Clock advance or input publish is unexpectedly heavy.",
};

export function diagnose(frame: NonNullable<ReturnType<typeof devtools.frame.stats>>, longs: readonly LongFrameEvent[]): string | null {
  if (frame.fps >= 55 && frame.longFrames === 0 && longs.length === 0) return null;
  const recent = longs.slice(-5);
  const culpritCounts = new Map<string, number>();
  for (const event of recent) {
    culpritCounts.set(event.culprit, (culpritCounts.get(event.culprit) ?? 0) + 1);
  }
  let topCulprit: string | null = null;
  let topCount = 0;
  for (const [name, count] of culpritCounts) {
    if (count > topCount) {
      topCulprit = name;
      topCount = count;
    }
  }
  if (topCulprit === null && frame.phases[0] !== undefined && frame.avgSimMs > 8) {
    topCulprit = frame.phases[0].name;
  }
  if (topCulprit === null && frame.avgOutsideMs > frame.avgSimMs && frame.avgOutsideMs > 4) {
    topCulprit = "outside-sim";
  }
  if (topCulprit === null) {
    if (frame.p95FrameMs > LONG_FRAME_MS) return `p95 ${ms(frame.p95FrameMs)} — hitching without a clear phase; check long-frame log as it fills.`;
    return null;
  }
  const hint = CULPRIT_HINTS[topCulprit] ?? `Hotspot “${topCulprit}” — dig into that phase with measure() or reduce its work.`;
  const countText = topCount > 0 ? ` (${topCount}/${recent.length || topCount} recent long frames)` : "";
  return `${topCulprit}${countText}: ${hint}`;
}
