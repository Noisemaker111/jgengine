import { devtools, type DevtoolsSnapshot, type LongFrameEvent } from "@jgengine/core/devtools/devtools";
import type { PlayableGame } from "../registry";
import { diagnose } from "./perfDiagnose";

function roundMs(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function compactLongFrame(event: LongFrameEvent) {
  return {
    at: event.at,
    frameMs: roundMs(event.frameMs),
    simMs: roundMs(event.simMs),
    outsideMs: roundMs(event.outsideMs),
    culprit: event.culprit,
    reason: event.reason,
    phases: event.phases.slice(0, 4).map((phase) => ({
      name: phase.name,
      ms: roundMs(phase.ms),
    })),
    probes: event.probes,
    render: event.render,
  };
}

function summarizeLongFrames(events: readonly LongFrameEvent[]) {
  if (events.length === 0) return null;
  const byCulprit = new Map<string, number>();
  let maxFrameMs = 0;
  let maxDraws = 0;
  let maxGeometries = 0;
  for (const event of events) {
    byCulprit.set(event.culprit, (byCulprit.get(event.culprit) ?? 0) + 1);
    maxFrameMs = Math.max(maxFrameMs, event.frameMs);
    if (event.render !== null) {
      maxDraws = Math.max(maxDraws, event.render.drawCalls);
      maxGeometries = Math.max(maxGeometries, event.render.geometries);
    }
  }
  const culprits = [...byCulprit.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([culprit, count]) => ({ culprit, count }));
  return {
    count: events.length,
    culprits,
    maxFrameMs: roundMs(maxFrameMs),
    maxDrawCalls: maxDraws > 0 ? maxDraws : undefined,
    maxGeometries: maxGeometries > 0 ? maxGeometries : undefined,
  };
}

/** @internal */
export function buildLeanReport(playable: PlayableGame) {
  const snap = devtools.snapshot();
  const frame = snap.frame;
  const longs = snap.longFrames;
  const why = frame !== null ? diagnose(frame, longs) : null;
  const changedControls = snap.controls
    .filter((control) => !Object.is(control.value, control.initial))
    .map((control) => ({ name: control.name, value: control.value, initial: control.initial }));
  const enabledDiscovered = snap.discovered
    .filter((entry) => entry.enabled)
    .map((entry) => ({ id: entry.id, value: entry.value }));
  const hotLogs = snap.logs.filter((entry) => entry.level === "warn" || entry.level === "error").slice(-20);

  return {
    game: playable.game.name,
    at: snap.at,
    why,
    frame:
      frame === null
        ? null
        : {
            fps: roundMs(frame.fps, 1),
            avgFrameMs: roundMs(frame.avgFrameMs),
            p95FrameMs: roundMs(frame.p95FrameMs),
            maxFrameMs: roundMs(frame.maxFrameMs),
            avgSimMs: roundMs(frame.avgSimMs),
            maxSimMs: roundMs(frame.maxSimMs),
            avgOutsideMs: roundMs(frame.avgOutsideMs),
            maxOutsideMs: roundMs(frame.maxOutsideMs),
            longFrames: frame.longFrames,
            samples: frame.samples,
            phases: frame.phases.slice(0, 8).map((phase) => ({
              name: phase.name,
              avgMs: roundMs(phase.avgMs),
              maxMs: roundMs(phase.maxMs),
              pctOfSim: Math.round(phase.pctOfSim),
            })),
          },
    render: snap.render,
    latency: snap.latency,
    longFrameSummary: summarizeLongFrames(longs),
    longFrames: longs.slice(-6).map(compactLongFrame),
    probes: snap.probes,
    logs: hotLogs.length > 0 ? hotLogs : undefined,
    controls: changedControls.length > 0 ? changedControls : undefined,
    discovered: enabledDiscovered.length > 0 ? enabledDiscovered : undefined,
    discoveredCount: snap.discovered.length,
  };
}

/** @internal */
export function buildFullReport(playable: PlayableGame): DevtoolsSnapshot & { game: string } {
  return { game: playable.game.name, ...devtools.snapshot() };
}

