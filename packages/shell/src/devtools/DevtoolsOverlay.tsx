import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  devtools,
  instrumentLatency,
  type DevtoolsSnapshot,
  type LongFrameEvent,
} from "@jgengine/core/devtools/devtools";
import { MOVEMENT_TUNING } from "@jgengine/core/movement/movementModel";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { ShellMultiplayer } from "../multiplayer";
import type { PlayableGame } from "../registry";
import { collisionDebug } from "./collisionDebug";
import { readStoredOverrides } from "./devtoolsOverrides";
import { diagnose } from "./perfDiagnose";
import { PerfPanel } from "./PerfPanel";
import { LogsPanel } from "./LogsPanel";
import { NetPanel } from "./NetPanel";
import { KeysPanel } from "./KeysPanel";
import { ColPanel } from "./ColPanel";
import { TunePanel } from "./TunePanel";

export { applyStoredDevtoolsOverrides, persistDevtoolsOverrides } from "./devtoolsOverrides";

const REFRESH_MS = 250;

/** @internal */
export function withDevtoolsLatency(multiplayer: ShellMultiplayer): ShellMultiplayer {
  return {
    ...multiplayer,
    backend: {
      ...instrumentLatency(multiplayer.backend, ["pushFeedEntry"]),
      transport: instrumentLatency(multiplayer.backend.transport, ["joinServer", "leaveServer", "runCommand"]),
    },
  };
}

/** @internal */
export function DevtoolsRendererProbe() {
  const frameCounter = useRef(0);
  useFrame((state) => {
    frameCounter.current += 1;
    if (frameCounter.current % 30 !== 0) return;
    const info = state.gl.info;
    devtools.render.record({
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    });
  });
  return null;
}

type DevtoolsTab = "perf" | "logs" | "net" | "keys" | "tune" | "col";

const TABS: { id: DevtoolsTab; label: string }[] = [
  { id: "perf", label: "Perf" },
  { id: "tune", label: "Tune" },
  { id: "col", label: "Col" },
  { id: "logs", label: "Logs" },
  { id: "net", label: "Net" },
  { id: "keys", label: "Keys" },
];

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

/** @internal */
export function DevtoolsOverlay({
  open,
  ctx,
  playable,
  multiplayer,
}: {
  open: boolean;
  ctx: GameContext;
  playable: PlayableGame;
  multiplayer: ShellMultiplayer | null;
}) {
  const [tab, setTab] = useState<DevtoolsTab>("perf");
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  useSyncExternalStore(devtools.signal.subscribe, devtools.signal.version, devtools.signal.version);

  useEffect(() => {
    devtools.logs.captureConsole();
    (globalThis as { __JG_DEVTOOLS?: unknown }).__JG_DEVTOOLS = {
      snapshot: () => buildLeanReport(playable),
      snapshotFull: () => buildFullReport(playable),
      controls: devtools.controls,
      discover: devtools.discover,
      frame: devtools.frame,
      profile: devtools.profile,
      collisionDebug,
    };
  }, [playable]);

  useEffect(() => {
    devtools.discover.scanTable("game", playable);
    devtools.discover.scanTable("engine", { movement: MOVEMENT_TUNING });
  }, [playable]);

  useEffect(() => {
    const stored = readStoredOverrides(playable.game.name);
    if (stored === null) return;
    const appliedEnables = new Set<string>();
    const appliedValues = new Set<string>();
    const applyLateRegistrations = () => {
      const discovered = new Map(devtools.discover.list().map((entry) => [entry.id, entry]));
      const needEnable = stored.enabled.filter(
        (id) => !appliedEnables.has(id) && discovered.get(id)?.enabled === false,
      );
      const needValue = Object.entries(stored.values).filter(
        ([name]) => !appliedValues.has(name) && devtools.controls.get(name) !== null,
      );
      if (needEnable.length === 0 && needValue.length === 0) return;
      for (const id of needEnable) appliedEnables.add(id);
      for (const [name] of needValue) appliedValues.add(name);
      devtools.overrides.apply({ enabled: needEnable, values: Object.fromEntries(needValue) });
    };
    applyLateRegistrations();
    return devtools.signal.subscribe(applyLateRegistrations);
  }, [playable]);

  useEffect(() => {
    const disposers = [
      devtools.probes.register("entities", () => ctx.scene.entity.list().length),
      devtools.probes.register("objects", () => ctx.scene.object.list().length),
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [ctx]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setTick((current) => current + 1), REFRESH_MS);
    return () => clearInterval(interval);
  }, [open]);

  if (!open) return null;

  const copyReport = () => {
    const report = JSON.stringify(buildLeanReport(playable), null, 2);
    const clipboard = navigator.clipboard;
    if (clipboard !== undefined) {
      void clipboard.writeText(report).catch(() => console.log(report));
    } else {
      console.log(report);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-50 w-[22rem] rounded-xl border border-white/10 bg-[#0c0e12]/95 p-3 text-xs text-neutral-100 shadow-2xl shadow-black/60 backdrop-blur-md">
      <style>{`
        .jg-devtools-scroll {
          scrollbar-width: thin;
          scrollbar-color: #52525b #18181b;
        }
        .jg-devtools-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .jg-devtools-scroll::-webkit-scrollbar-track {
          background: #18181b;
          border-radius: 9999px;
        }
        .jg-devtools-scroll::-webkit-scrollbar-thumb {
          background-color: #52525b;
          border-radius: 9999px;
          border: 2px solid #18181b;
        }
        .jg-devtools-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #71717a;
        }
      `}</style>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
          {playable.game.name} devtools
        </span>
        <button
          type="button"
          className="rounded-md bg-white/[0.04] px-2 py-0.5 text-neutral-300 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/10"
          onClick={copyReport}
        >
          {copied ? "Copied" : "Copy report"}
        </button>
      </div>
      <div className="mb-2.5 flex gap-0.5 rounded-lg bg-black/40 p-0.5 ring-1 ring-inset ring-white/[0.06]">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`flex-1 rounded-md px-2 py-1 transition-colors ${tab === entry.id ? "bg-cyan-500/90 font-medium text-white shadow-sm shadow-cyan-950/50" : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {tab === "perf" ? <PerfPanel ctx={ctx} /> : null}
      {tab === "logs" ? <LogsPanel /> : null}
      {tab === "net" ? <NetPanel multiplayer={multiplayer} /> : null}
      {tab === "keys" ? <KeysPanel input={playable.game.input} /> : null}
      {tab === "tune" ? <TunePanel gameName={playable.game.name} /> : null}
      {tab === "col" ? <ColPanel /> : null}
      <div className="mt-2.5 border-t border-white/[0.06] pt-2 text-[9px] tracking-wide text-neutral-500">
        F2+D toggles · Col = collision · agents: __JG_DEVTOOLS.snapshot() · .collisionDebug
      </div>
    </div>
  );
}
