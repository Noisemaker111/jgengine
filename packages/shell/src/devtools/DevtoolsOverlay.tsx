import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  devtools,
} from "@jgengine/core/devtools/devtools";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { ShellMultiplayer } from "../multiplayer";
import type { PlayableGame } from "../registry";
import { heavyModels } from "../render/modelLoad";
import { buildLeanReport } from "./devtoolsReports";
import { PerfPanel } from "./PerfPanel";
import { LogsPanel } from "./LogsPanel";
import { NetPanel } from "./NetPanel";
import { KeysPanel } from "./KeysPanel";
import { ColPanel } from "./ColPanel";
import { TunePanel } from "./TunePanel";

export { applyStoredDevtoolsOverrides, persistDevtoolsOverrides } from "./devtoolsOverrides";

const REFRESH_MS = 250;

export { withDevtoolsLatency } from "./latencyInstrumentation";

const RENDER_SAMPLE_MS = 500;
const RENDER_PROBE_FRAME_PRIORITY = -10;

/** @internal */
export function DevtoolsRendererProbe() {
  useEffect(() => devtools.probes.register("heavyModels", () => heavyModels()), []);
  const gl = useThree((state) => state.gl);
  const lastSampleAt = useRef(0);
  useEffect(() => {
    // three resets gl.info after every render() call, so with a multi-pass
    // composer the counters only ever hold the last fullscreen pass. Own the
    // reset instead: accumulate across the whole frame, reset at frame start.
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((state) => {
    const info = state.gl.info;
    const now = performance.now();
    if (now - lastSampleAt.current >= RENDER_SAMPLE_MS) {
      lastSampleAt.current = now;
      devtools.render.record({
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      });
    }
    info.reset();
  }, RENDER_PROBE_FRAME_PRIORITY);
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

export { buildLeanReport, buildFullReport } from "./devtoolsReports";

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
