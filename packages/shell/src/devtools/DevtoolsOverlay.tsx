import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  devtools,
  instrumentLatency,
  type DevtoolsControl,
  type DevtoolsSnapshot,
} from "@jgengine/core/devtools/devtools";
import { bindingLabel, type ActionCodes, type ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { ShellMultiplayer } from "../multiplayer";
import type { PlayableGame } from "../registry";

const REFRESH_MS = 250;
const LONG_FRAME_MS = 33.4;

export function withDevtoolsLatency(multiplayer: ShellMultiplayer): ShellMultiplayer {
  return {
    ...multiplayer,
    backend: {
      ...instrumentLatency(multiplayer.backend, ["pushFeedEntry"]),
      transport: instrumentLatency(multiplayer.backend.transport, ["joinServer", "leaveServer", "runCommand"]),
    },
  };
}

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

interface KeybindRow {
  action: string;
  codes: string;
  mode: "press" | "hold" | "toggle";
}

function keybindRows(input: ActionCodesMap | undefined): KeybindRow[] {
  const rows: KeybindRow[] = [];
  for (const [action, codes] of Object.entries(input ?? {})) {
    const entries = flattenCodes(codes);
    for (const entry of entries) rows.push({ action, ...entry });
  }
  return rows;
}

function flattenCodes(codes: ActionCodes): { codes: string; mode: "press" | "hold" | "toggle" }[] {
  if (Array.isArray(codes)) {
    return [{ codes: codes.map(bindingLabel).join(" / "), mode: "press" }];
  }
  const modes = codes as { hold?: readonly string[]; toggle?: readonly string[] };
  const result: { codes: string; mode: "press" | "hold" | "toggle" }[] = [];
  if (modes.hold !== undefined && modes.hold.length > 0) {
    result.push({ codes: modes.hold.map(bindingLabel).join(" / "), mode: "hold" });
  }
  if (modes.toggle !== undefined && modes.toggle.length > 0) {
    result.push({ codes: modes.toggle.map(bindingLabel).join(" / "), mode: "toggle" });
  }
  return result;
}

type DevtoolsTab = "perf" | "logs" | "net" | "keys" | "tune";

const TABS: { id: DevtoolsTab; label: string }[] = [
  { id: "perf", label: "Perf" },
  { id: "tune", label: "Tune" },
  { id: "logs", label: "Logs" },
  { id: "net", label: "Net" },
  { id: "keys", label: "Keys" },
];

function ms(value: number): string {
  return `${value.toFixed(1)}ms`;
}

function StatRow({ name, value, alert }: { name: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-neutral-400">{name}</span>
      <span className={`font-mono ${alert === true ? "text-red-400" : "text-neutral-100"}`}>{value}</span>
    </div>
  );
}

function FrameBars({ frames }: { frames: readonly number[] }) {
  return (
    <div className="flex h-10 items-end gap-px">
      {frames.map((frameMs, index) => (
        <div
          key={index}
          className={`w-1 rounded-sm ${frameMs > LONG_FRAME_MS ? "bg-red-500" : "bg-emerald-500/80"}`}
          style={{ height: `${Math.min(100, (frameMs / (LONG_FRAME_MS * 2)) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function PerfPanel({ ctx }: { ctx: GameContext }) {
  const rateRef = useRef<{ version: number; at: number; perSecond: number }>({ version: 0, at: 0, perSecond: 0 });
  const frame = devtools.frame.stats();
  const render = devtools.render.latest();
  const now = performance.now();
  const rate = rateRef.current;
  if (rate.at === 0) {
    rateRef.current = { version: ctx.version(), at: now, perSecond: 0 };
  } else if (now - rate.at >= 900) {
    const perSecond = ((ctx.version() - rate.version) / (now - rate.at)) * 1000;
    rateRef.current = { version: ctx.version(), at: now, perSecond };
  }
  return (
    <div className="space-y-2">
      {frame === null ? (
        <div className="text-neutral-400">Waiting for frames…</div>
      ) : (
        <>
          <FrameBars frames={frame.recentFrameMs} />
          <StatRow name="fps" value={frame.fps.toFixed(0)} alert={frame.fps < 50} />
          <StatRow name="frame avg / p95 / max" value={`${ms(frame.avgFrameMs)} / ${ms(frame.p95FrameMs)} / ${ms(frame.maxFrameMs)}`} alert={frame.p95FrameMs > LONG_FRAME_MS} />
          <StatRow name="sim avg / max" value={`${ms(frame.avgSimMs)} / ${ms(frame.maxSimMs)}`} alert={frame.avgSimMs > 8} />
          <StatRow name={`long frames (of ${frame.samples})`} value={String(frame.longFrames)} alert={frame.longFrames > 5} />
        </>
      )}
      {render !== null ? (
        <>
          <StatRow name="draw calls" value={String(render.drawCalls)} alert={render.drawCalls > 1000} />
          <StatRow name="triangles" value={render.triangles.toLocaleString()} />
          <StatRow name="geometries / textures" value={`${render.geometries} / ${render.textures}`} />
        </>
      ) : null}
      <StatRow name="state notifies /s" value={rateRef.current.perSecond.toFixed(0)} alert={rateRef.current.perSecond > 90} />
      {Object.entries(devtools.probes.read()).map(([name, value]) => (
        <StatRow key={name} name={name} value={String(value)} />
      ))}
    </div>
  );
}

function LogsPanel() {
  const entries = devtools.logs.list().slice(-60);
  const colors: Record<string, string> = {
    error: "text-red-400",
    warn: "text-amber-300",
    info: "text-sky-300",
    log: "text-neutral-300",
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded border border-neutral-600 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
        onClick={() => devtools.logs.clear()}
      >
        Clear
      </button>
      <div className="max-h-64 space-y-0.5 overflow-auto font-mono text-[10px]">
        {entries.length === 0 ? <div className="text-neutral-400">No logs captured yet.</div> : null}
        {entries.map((entry, index) => (
          <div key={index} className={colors[entry.level]}>
            <span className="text-neutral-500">{new Date(entry.at).toLocaleTimeString()} </span>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function NetPanel({ multiplayer }: { multiplayer: ShellMultiplayer | null }) {
  const stats = devtools.latency.stats();
  if (multiplayer === null) {
    return <div className="text-neutral-400">Offline — no multiplayer backend attached.</div>;
  }
  return (
    <div className="space-y-2">
      <StatRow name="game / user" value={`${multiplayer.gameId} / ${multiplayer.userId}`} />
      {stats === null ? (
        <div className="text-neutral-400">No round trips observed yet — latency is sampled from real backend calls.</div>
      ) : (
        <>
          <StatRow name="last round trip" value={ms(stats.lastMs)} alert={stats.lastMs > 250} />
          <StatRow name="avg / min / max" value={`${ms(stats.avgMs)} / ${ms(stats.minMs)} / ${ms(stats.maxMs)}`} />
          <StatRow name="samples" value={String(stats.samples)} />
        </>
      )}
    </div>
  );
}

function KeysPanel({ input }: { input: ActionCodesMap | undefined }) {
  const rows = keybindRows(input);
  if (rows.length === 0) return <div className="text-neutral-400">This game declares no keybinds.</div>;
  return (
    <div className="max-h-64 space-y-0.5 overflow-auto">
      {rows.map((row, index) => (
        <div key={index} className="flex items-baseline justify-between gap-3">
          <span className="text-neutral-300">{row.action}</span>
          <span className="font-mono text-neutral-100">
            {row.codes}
            {row.mode !== "press" ? <span className="ml-1 text-[9px] uppercase text-neutral-500">{row.mode}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function ControlInput({ control }: { control: DevtoolsControl }) {
  const value = control.read();
  if (control.kind === "slider") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="h-1 w-28 accent-emerald-400"
          min={control.min}
          max={control.max}
          step={control.step}
          value={Number(value)}
          onChange={(event) => control.write(Number(event.target.value))}
        />
        <input
          type="number"
          className="w-16 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 font-mono text-neutral-100"
          step={control.step}
          value={Number(value)}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) control.write(next);
          }}
        />
      </div>
    );
  }
  if (control.kind === "toggle") {
    return (
      <input
        type="checkbox"
        className="h-4 w-4 accent-emerald-400"
        checked={Boolean(value)}
        onChange={(event) => control.write(event.target.checked)}
      />
    );
  }
  if (control.kind === "color") {
    return (
      <input
        type="color"
        className="h-6 w-10 cursor-pointer rounded border border-neutral-600 bg-transparent"
        value={String(value)}
        onChange={(event) => control.write(event.target.value)}
      />
    );
  }
  if (control.kind === "select") {
    return (
      <select
        className="rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 text-neutral-100"
        value={String(value)}
        onChange={(event) => {
          const match = control.options?.find((option) => String(option) === event.target.value);
          control.write(match ?? event.target.value);
        }}
      >
        {control.options?.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      className="w-32 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 font-mono text-neutral-100"
      value={String(value)}
      onChange={(event) => control.write(event.target.value)}
    />
  );
}

function TunePanel() {
  const controls = devtools.controls.list();
  if (controls.length === 0) {
    return (
      <div className="space-y-2 text-neutral-400">
        <div>No tunables registered.</div>
        <div className="font-mono text-[10px] text-neutral-500">
          {'import { tunable } from "@jgengine/core/devtools/devtools";'}
          <br />
          {'const gravity = tunable("physics/gravity", -22);'}
          <br />
          {"read gravity.value where the game uses it."}
        </div>
      </div>
    );
  }
  const groups = new Map<string, DevtoolsControl[]>();
  for (const control of controls) {
    const list = groups.get(control.group) ?? [];
    list.push(control);
    groups.set(control.group, list);
  }
  return (
    <div className="max-h-72 space-y-3 overflow-auto">
      <button
        type="button"
        className="rounded border border-neutral-600 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
        onClick={() => devtools.controls.resetAll()}
      >
        Reset all
      </button>
      {[...groups.entries()].map(([group, members]) => (
        <div key={group} className="space-y-1.5">
          <div className="text-[9px] uppercase tracking-wide text-neutral-500">{group}</div>
          {members.map((control) => (
            <div key={control.name} className="flex items-center justify-between gap-3">
              <span className="text-neutral-300" title={control.name}>
                {control.label}
              </span>
              <ControlInput control={control} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function buildReport(playable: PlayableGame): DevtoolsSnapshot & { game: string } {
  return { game: playable.game.name, ...devtools.snapshot() };
}

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
      snapshot: () => buildReport(playable),
      controls: devtools.controls,
    };
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
    const report = JSON.stringify(buildReport(playable), null, 2);
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
    <div className="pointer-events-auto absolute left-4 top-4 z-50 w-80 rounded border border-neutral-700 bg-neutral-950/95 p-3 text-xs text-neutral-100 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide text-neutral-300">{playable.game.name} devtools</span>
        <button
          type="button"
          className="rounded border border-neutral-600 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
          onClick={copyReport}
        >
          {copied ? "Copied" : "Copy report"}
        </button>
      </div>
      <div className="mb-2 flex gap-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`rounded px-2 py-0.5 ${tab === entry.id ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:bg-neutral-800"}`}
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
      {tab === "tune" ? <TunePanel /> : null}
      <div className="mt-2 border-t border-neutral-800 pt-1.5 text-[9px] text-neutral-500">
        F2 toggles · agents: window.__JG_DEVTOOLS.snapshot()
      </div>
    </div>
  );
}
