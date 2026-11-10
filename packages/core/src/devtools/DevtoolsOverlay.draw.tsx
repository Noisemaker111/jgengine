import { useEffect, useState, useSyncExternalStore } from "react";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import {
  devtools,
} from "@jgengine/core/devtools/devtools";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { ShellMultiplayer } from "../multiplayer/multiplayer.draw";
import type { PlayableGame } from "@jgengine/shell/registry";
import { heavyModels } from "@jgengine/core/model/modelLoad.draw";
import { triangleProbe } from "@jgengine/core/render/triangleAttribution.draw";
import { webGpuContextOf } from "@jgengine/core/webgpu/engineRenderer.draw";
import { buildLeanReport } from "./devtoolsReports.draw";
import { sceneProbeReading } from "./discover";
import { PerfPanel } from "./PerfPanel.view";
import { LogsPanel } from "./LogsPanel.view";
import { NetPanel } from "./NetPanel.draw";
import { KeysPanel } from "./KeysPanel.view";
import { ColPanel } from "./ColPanel.view";
import { TunePanel } from "./TunePanel.view";

export { applyStoredDevtoolsOverrides, persistDevtoolsOverrides } from "./devtoolsOverrides.view";

const REFRESH_MS = 250;

export { withDevtoolsLatency } from "./latencyInstrumentation.draw";

const RENDER_SAMPLE_MS = 500;
const RENDER_PROBE_FRAME_PRIORITY = -10;

/**
 * Draw-side form of {@link DevtoolsRendererProbe}: registers the render probes against the mounted
 * renderer and scene, owns `gl.info.autoReset` for the frame, and samples draw stats once per
 * {@link RENDER_SAMPLE_MS} at {@link RENDER_PROBE_FRAME_PRIORITY}.
 * @internal
 */
export function devtoolsRendererProbeDraw(): EngineDraw {
  let disposes: (() => void)[] = [];
  let lastSampleAt = 0;
  return {
    priority: RENDER_PROBE_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      const gl = state.renderer;
      const scene = state.rootScene ?? state.scene;
      disposes.push(devtools.probes.register("heavyModels", () => heavyModels()));
      disposes.push(devtools.probes.register("shaderPrograms", () => gl.info.programs?.length ?? 0));
      const context = webGpuContextOf(gl);
      if (context !== null) {
        let last = { ...context.stats };
        let lastAt = performance.now();
        let reading = { frames: 0, passes: 0, clearPasses: 0, replayedPasses: 0, draws: 0, submits: 0, uniformBytes: 0, bindGroups: 0, pipelines: 0 };
        // Counters and state read back to back share one window; a new window opens every RENDER_SAMPLE_MS.
        const perFrame = () => {
          const at = performance.now();
          if (at - lastAt < RENDER_SAMPLE_MS && reading.frames > 0) return reading;
          const now = context.stats;
          const frames = Math.max(1, now.frames - last.frames);
          const per = (key: "passes" | "clearPasses" | "replayedPasses" | "draws" | "submits" | "uniformBytes" | "bindGroups" | "pipelines") => Math.round(((now[key] - last[key]) / frames) * 10) / 10;
          reading = { frames: now.frames - last.frames, passes: per("passes"), clearPasses: per("clearPasses"), replayedPasses: per("replayedPasses"), draws: per("draws"), submits: per("submits"), uniformBytes: per("uniformBytes"), bindGroups: per("bindGroups"), pipelines: per("pipelines") };
          last = { ...now };
          lastAt = at;
          return reading;
        };
        disposes.push(devtools.probes.registerSystem("render/webgpu", {
          counters: perFrame,
          state: () => {
            const { passes, clearPasses, replayedPasses, draws, submits, uniformBytes } = perFrame();
            return `per frame: ${passes} passes (${clearPasses} clear-only, ${replayedPasses} replayed) · ${draws} draws · ${submits} submits · ${uniformBytes} uniform bytes`;
          },
        }));
      }
      // One walk serves the counters, the state line and the probe: a snapshot reads the same frame.
      const probe = triangleProbe(scene);
      const read = sceneProbeReading(() => probe.table());
      disposes.push(devtools.probes.register("render/triangles", () => read()));
      disposes.push(devtools.probes.registerSystem("render/triangles", {
        counters: () => {
          const { triangles, casters, lines } = read();
          return { triangles, casters, lines: lines.length };
        },
        state: () => {
          const { triangles, casters, lines } = read();
          const top = lines[0];
          return top === undefined
            ? `${triangles} triangles`
            : `${triangles} triangles · casters ${casters} · top ${top.label} ${top.triangles}`;
        },
      }));
      // three resets gl.info after every render() call, so with a multi-pass
      // composer the counters only ever hold the last fullscreen pass. Own the
      // reset instead: accumulate across the whole frame, reset at frame start.
      gl.info.autoReset = false;
    },
    frame(state: EngineFrameState) {
      const info = state.gl.info;
      const now = performance.now();
      if (now - lastSampleAt >= RENDER_SAMPLE_MS) {
        lastSampleAt = now;
        devtools.render.record({
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
        });
      }
      info.reset();
    },
    dispose(state: EngineFrameState) {
      for (const dispose of disposes.splice(0)) dispose();
      state.gl.info.autoReset = true;
    },
  };
}

/** @internal */
export function DevtoolsRendererProbe() {
  useEngineDraw(() => devtoolsRendererProbeDraw(), []);
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

export { buildLeanReport, buildFullReport } from "./devtoolsReports.draw";

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
    if (!open) return;
    let lastRefresh = 0;
    return ctx.subscribe(() => {
      const now = performance.now();
      if (now - lastRefresh < REFRESH_MS) return;
      lastRefresh = now;
      setTick((current) => current + 1);
    });
  }, [ctx, open]);

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
