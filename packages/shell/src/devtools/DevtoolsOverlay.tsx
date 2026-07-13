import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  convertAngle,
  devtools,
  instrumentLatency,
  LONG_FRAME_MS,
  parseColor,
  parseOverridesPayload,
  type DevtoolsControl,
  type DevtoolsOverrides,
  type DevtoolsSnapshot,
  type DiscoveredEntry,
  type LongFrameEvent,
  type PhaseStats,
} from "@jgengine/core/devtools/devtools";
import { getSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { bindingLabel, type ActionCodes, type ActionCodesMap } from "@jgengine/core/input/actionBindings";
import { MOVEMENT_TUNING } from "@jgengine/core/movement/movementModel";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { ShellMultiplayer } from "../multiplayer";
import type { PlayableGame } from "../registry";
import {
  COLLISION_DEBUG_LAYERS,
  collisionDebug,
  type CollisionDebugLayer,
} from "./collisionDebug";

const REFRESH_MS = 250;
const PHASE_BAR_BUDGET_MS = 16.7;
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

function overridesStorageKey(gameName: string): string {
  return `jg-devtools:${gameName}`;
}

function readStoredOverrides(gameName: string): DevtoolsOverrides | null {
  try {
    const raw = localStorage.getItem(overridesStorageKey(gameName));
    if (raw === null) return null;
    const parsed = parseOverridesPayload(JSON.parse(raw) as unknown);
    if (parsed.overrides === null) {
      for (const message of parsed.diagnostics) console.warn(`[jgengine:devtools] ${message}`);
      return null;
    }
    for (const message of parsed.diagnostics) console.info(`[jgengine:devtools] ${message}`);
    return parsed.overrides;
  } catch {
    return null;
  }
}

export function persistDevtoolsOverrides(gameName: string): DevtoolsOverrides {
  const overrides = devtools.overrides.export();
  try {
    localStorage.setItem(overridesStorageKey(gameName), JSON.stringify(overrides));
  } catch {
    return overrides;
  }
  return overrides;
}

export function applyStoredDevtoolsOverrides(gameName: string): void {
  const stored = readStoredOverrides(gameName);
  if (stored === null) return;
  const result = devtools.overrides.apply(stored);
  if (result.applied === 0 && result.skipped.length === 0) return;
  console.info(
    `[jgengine:devtools] applied ${result.applied} stored override(s) for ${gameName}` +
      (result.skipped.length > 0 ? ` · skipped ${result.skipped.length}` : ""),
  );
  for (const entry of result.skipped) {
    console.warn(`[jgengine:devtools] skipped override ${entry.id}: ${entry.reason}`);
  }
}

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

type DevtoolsTab = "perf" | "logs" | "net" | "keys" | "tune" | "col";

const TABS: { id: DevtoolsTab; label: string }[] = [
  { id: "perf", label: "Perf" },
  { id: "tune", label: "Tune" },
  { id: "col", label: "Col" },
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
          title={`${frameMs.toFixed(1)}ms`}
        />
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <div className="text-[9px] uppercase tracking-wide text-neutral-500">{children}</div>;
}

function PhaseBars({ phases, avgSimMs }: { phases: readonly PhaseStats[]; avgSimMs: number }) {
  if (phases.length === 0) {
    return <div className="text-neutral-500">No phase samples yet.</div>;
  }
  const budget = Math.max(PHASE_BAR_BUDGET_MS, avgSimMs, ...phases.map((phase) => phase.avgMs));
  return (
    <div className="space-y-1">
      {phases.slice(0, 8).map((phase) => {
        const hot = phase.avgMs > 4 || phase.maxMs > 8;
        return (
          <div key={phase.name} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`truncate ${hot ? "text-amber-300" : "text-neutral-300"}`} title={phase.name}>
                {phase.name}
              </span>
              <span className={`shrink-0 font-mono ${hot ? "text-amber-300" : "text-neutral-100"}`}>
                {ms(phase.avgMs)}
                <span className="text-neutral-500"> avg</span>
                <span className="text-neutral-600"> · </span>
                {ms(phase.maxMs)}
                <span className="text-neutral-500"> max</span>
                <span className="text-neutral-600"> · </span>
                {phase.pctOfSim.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className={`h-full rounded-full ${hot ? "bg-amber-400" : "bg-emerald-500/80"}`}
                style={{ width: `${Math.min(100, (phase.avgMs / budget) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BudgetSplit({ simMs, outsideMs }: { simMs: number; outsideMs: number }) {
  const total = Math.max(1e-6, simMs + outsideMs);
  const simPct = (simMs / total) * 100;
  const outsideHot = outsideMs > simMs && outsideMs > 4;
  const simHot = simMs > 8;
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-neutral-800">
        <div className={`h-full ${simHot ? "bg-amber-400" : "bg-sky-400"}`} style={{ width: `${simPct}%` }} title={`sim ${ms(simMs)}`} />
        <div
          className={`h-full ${outsideHot ? "bg-red-500" : "bg-violet-400/80"}`}
          style={{ width: `${100 - simPct}%` }}
          title={`outside sim ${ms(outsideMs)}`}
        />
      </div>
      <div className="flex justify-between gap-2 font-mono text-[10px]">
        <span className={simHot ? "text-amber-300" : "text-sky-300"}>sim {ms(simMs)}</span>
        <span className={outsideHot ? "text-red-400" : "text-violet-300"}>outside {ms(outsideMs)}</span>
      </div>
      <div className="text-[10px] text-neutral-500">
        outside = render / React / GPU / GC / missed vsync — not measured inside the sim driver
      </div>
    </div>
  );
}

function diagnose(frame: NonNullable<ReturnType<typeof devtools.frame.stats>>, longs: readonly LongFrameEvent[]): string | null {
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

function LongFrameList({ events }: { events: readonly LongFrameEvent[] }) {
  if (events.length === 0) {
    return <div className="text-neutral-500">No long frames (&gt;{ms(LONG_FRAME_MS)}) captured yet.</div>;
  }
  const newest = [...events].reverse().slice(0, 12);
  return (
    <div className="jg-devtools-scroll max-h-40 space-y-1.5 overflow-auto">
      {newest.map((event, index) => (
        <div key={`${event.at}-${index}`} className="rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-red-400">{ms(event.frameMs)}</span>
            <span className="truncate text-amber-300" title={event.culprit}>
              {event.culprit}
            </span>
            <span className="shrink-0 text-neutral-500">{new Date(event.at).toLocaleTimeString()}</span>
          </div>
          <div className="mt-0.5 text-[10px] leading-snug text-neutral-300">{event.reason}</div>
          {event.phases.length > 0 ? (
            <div className="mt-0.5 font-mono text-[9px] text-neutral-500">
              {event.phases
                .slice(0, 4)
                .map((phase) => `${phase.name} ${phase.ms.toFixed(1)}`)
                .join(" · ")}
              {event.outsideMs >= 2 ? ` · outside ${event.outsideMs.toFixed(1)}` : ""}
            </div>
          ) : event.outsideMs >= 2 ? (
            <div className="mt-0.5 font-mono text-[9px] text-neutral-500">outside {event.outsideMs.toFixed(1)}</div>
          ) : null}
          {event.render !== null ? (
            <div className="mt-0.5 font-mono text-[9px] text-neutral-600">
              draws {event.render.drawCalls} · tris {event.render.triangles.toLocaleString()}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PerfPanel({ ctx }: { ctx: GameContext }) {
  const rateRef = useRef<{ version: number; at: number; perSecond: number }>({ version: 0, at: 0, perSecond: 0 });
  const frame = devtools.frame.stats();
  const render = devtools.render.latest();
  const longs = devtools.frame.longFrames();
  const now = performance.now();
  const rate = rateRef.current;
  if (rate.at === 0) {
    rateRef.current = { version: ctx.version(), at: now, perSecond: 0 };
  } else if (now - rate.at >= 900) {
    const perSecond = ((ctx.version() - rate.version) / (now - rate.at)) * 1000;
    rateRef.current = { version: ctx.version(), at: now, perSecond };
  }
  const diagnosis = frame !== null ? diagnose(frame, longs) : null;
  return (
    <div className="jg-devtools-scroll max-h-[28rem] space-y-3 overflow-auto">
      {frame === null ? (
        <div className="text-neutral-400">Waiting for frames…</div>
      ) : (
        <>
          <FrameBars frames={frame.recentFrameMs} />
          <StatRow name="fps" value={frame.fps.toFixed(0)} alert={frame.fps < 50} />
          <StatRow name="frame avg / p95 / max" value={`${ms(frame.avgFrameMs)} / ${ms(frame.p95FrameMs)} / ${ms(frame.maxFrameMs)}`} alert={frame.p95FrameMs > LONG_FRAME_MS} />
          <StatRow name="sim avg / max" value={`${ms(frame.avgSimMs)} / ${ms(frame.maxSimMs)}`} alert={frame.avgSimMs > 8} />
          <StatRow name="outside avg / max" value={`${ms(frame.avgOutsideMs)} / ${ms(frame.maxOutsideMs)}`} alert={frame.avgOutsideMs > 12} />
          <StatRow name={`long frames (of ${frame.samples})`} value={String(frame.longFrames)} alert={frame.longFrames > 5} />
          {diagnosis !== null ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-100">
              <span className="font-semibold text-amber-300">Why slow · </span>
              {diagnosis}
            </div>
          ) : (
            <div className="text-[10px] text-emerald-400/90">Frame budget healthy — no dominant hitch pattern.</div>
          )}
          <div className="space-y-1">
            <SectionLabel>frame budget</SectionLabel>
            <BudgetSplit simMs={frame.avgSimMs} outsideMs={frame.avgOutsideMs} />
          </div>
          <div className="space-y-1">
            <SectionLabel>sim phases (avg)</SectionLabel>
            <PhaseBars phases={frame.phases} avgSimMs={frame.avgSimMs} />
          </div>
        </>
      )}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>long frames</SectionLabel>
          {longs.length > 0 ? (
            <button
              type="button"
              className="rounded border border-neutral-700 px-1.5 py-0.5 text-[9px] text-neutral-400 hover:bg-neutral-800"
              onClick={() => devtools.frame.clearLongFrames()}
            >
              Clear
            </button>
          ) : null}
        </div>
        <LongFrameList events={longs} />
      </div>
      {render !== null ? (
        <div className="space-y-1">
          <SectionLabel>render sample</SectionLabel>
          <StatRow name="draw calls" value={String(render.drawCalls)} alert={render.drawCalls > 1000} />
          <StatRow name="triangles" value={render.triangles.toLocaleString()} />
          <StatRow name="geometries / textures" value={`${render.geometries} / ${render.textures}`} />
        </div>
      ) : null}
      <div className="space-y-1">
        <SectionLabel>probes</SectionLabel>
        <StatRow name="state notifies /s" value={rateRef.current.perSecond.toFixed(0)} alert={rateRef.current.perSecond > 90} />
        {Object.entries(devtools.probes.read()).map(([name, value]) => (
          <StatRow key={name} name={name} value={String(value)} />
        ))}
      </div>
      <div className="text-[9px] leading-snug text-neutral-600">
        Game code: measure("physics", () =&gt; …) inside onTick. Agents: snapshot().longFrames + frame.phases
      </div>
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
      <div className="jg-devtools-scroll max-h-64 space-y-0.5 overflow-auto font-mono text-[10px]">
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
    <div className="jg-devtools-scroll max-h-64 space-y-0.5 overflow-auto">
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

const LAYER_LABELS: Record<CollisionDebugLayer, string> = {
  hitboxes: "Damage hitboxes",
  bodies: "Physical bodies",
  projectiles: "Projectile paths",
  muzzles: "Muzzle / shot origins",
  aimLaser: "Aim laser (authoritative)",
};

function ColPanel() {
  const state = useSyncExternalStore(
    collisionDebug.subscribe,
    () => collisionDebug.getState(),
    () => collisionDebug.getState(),
  );
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-neutral-500">
        F2 world collision debugger · layers stay on when panel closes · zero cost when all off
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          className="rounded border border-neutral-600 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
          onClick={() => collisionDebug.setAllLayers(true)}
        >
          All on
        </button>
        <button
          type="button"
          className="rounded border border-neutral-600 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
          onClick={() => collisionDebug.setAllLayers(false)}
        >
          All off
        </button>
      </div>
      <div className="space-y-1">
        {COLLISION_DEBUG_LAYERS.map((layer) => (
          <label key={layer} className="flex cursor-pointer items-center gap-2 text-neutral-200">
            <input
              type="checkbox"
              checked={state.layers[layer]}
              onChange={(event) => collisionDebug.setLayer(layer, event.target.checked)}
            />
            <span>{LAYER_LABELS[layer]}</span>
          </label>
        ))}
      </div>
      <div className="border-t border-neutral-800 pt-1.5 font-mono text-[9px] text-neutral-500">
        hitbox pink · body cyan · muzzle red · laser lime · X damage · ○ solid · · miss
      </div>
    </div>
  );
}

function ControlInput({ control, onWrite }: { control: DevtoolsControl; onWrite: () => void }) {
  const value = control.read();
  const write = (next: unknown) => {
    if (control.write(next)) onWrite();
  };
  if (control.kind === "slider" || control.kind === "angle") {
    const unit = control.unit ?? "rad";
    const displayUnit = control.displayUnit ?? (control.kind === "angle" ? "deg" : unit);
    const displayValue =
      control.kind === "angle" && typeof value === "number"
        ? convertAngle(value, unit, displayUnit)
        : Number(value);
    const displayMin =
      control.min !== undefined && control.kind === "angle"
        ? convertAngle(control.min, unit, displayUnit)
        : control.min;
    const displayMax =
      control.max !== undefined && control.kind === "angle"
        ? convertAngle(control.max, unit, displayUnit)
        : control.max;
    const displayStep =
      control.step !== undefined && control.kind === "angle" && unit !== displayUnit
        ? convertAngle(control.step, unit, displayUnit)
        : control.step;
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="h-1 w-28 accent-emerald-400"
          min={displayMin}
          max={displayMax}
          step={displayStep}
          value={displayValue}
          onChange={(event) => {
            const next = Number(event.target.value);
            write(control.kind === "angle" ? convertAngle(next, displayUnit, unit) : next);
          }}
        />
        <input
          type="number"
          className="w-16 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 font-mono text-neutral-100"
          step={displayStep}
          value={Number(displayValue.toFixed(4))}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) {
              write(control.kind === "angle" ? convertAngle(next, displayUnit, unit) : next);
            }
          }}
        />
        {control.kind === "angle" ? (
          <span className="text-[10px] text-neutral-500">{displayUnit}</span>
        ) : null}
      </div>
    );
  }
  if (control.kind === "toggle") {
    return (
      <input
        type="checkbox"
        className="h-4 w-4 accent-emerald-400"
        checked={Boolean(value)}
        onChange={(event) => write(event.target.checked)}
      />
    );
  }
  if (control.kind === "color") {
    const parsed = parseColor(value);
    const rgb = parsed?.rgb ?? "#000000";
    const alpha = parsed?.alpha ?? 1;
    const showAlpha = control.hasAlpha === true || parsed?.hasAlpha === true;
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-6 w-10 cursor-pointer rounded border border-neutral-600 bg-transparent"
          value={rgb}
          onChange={(event) => {
            if (showAlpha) {
              const a = Math.round(alpha * 255)
                .toString(16)
                .padStart(2, "0");
              write(`${event.target.value}${a}`);
            } else {
              write(event.target.value);
            }
          }}
        />
        {showAlpha ? (
          <input
            type="range"
            className="h-1 w-16 accent-emerald-400"
            min={0}
            max={1}
            step={0.01}
            value={alpha}
            onChange={(event) => {
              const nextAlpha = Number(event.target.value);
              const a = Math.round(nextAlpha * 255)
                .toString(16)
                .padStart(2, "0");
              write(`${rgb}${a}`);
            }}
          />
        ) : null}
      </div>
    );
  }
  if (control.kind === "select" || control.kind === "enum") {
    const choices =
      control.choices ??
      control.options?.map((option) => ({ value: option, label: String(option) })) ??
      [];
    return (
      <select
        className="rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 text-neutral-100"
        value={String(value)}
        onChange={(event) => {
          const match = choices.find((choice) => String(choice.value) === event.target.value);
          if (match !== undefined) write(match.value);
        }}
      >
        {choices.map((choice) => (
          <option key={String(choice.value)} value={String(choice.value)}>
            {choice.label ?? String(choice.value)}
          </option>
        ))}
      </select>
    );
  }
  if (control.kind === "vec2" || control.kind === "vec3" || control.kind === "vec4") {
    const axes = Array.isArray(value) ? (value as number[]) : [];
    const labels = control.axisLabels ?? ["x", "y", "z", "w"];
    return (
      <div className="flex flex-wrap items-center gap-1">
        {axes.map((axis, index) => (
          <label key={labels[index] ?? index} className="flex items-center gap-0.5 text-[10px] text-neutral-400">
            <span>{labels[index]}</span>
            <input
              type="number"
              className="w-14 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 font-mono text-neutral-100"
              min={control.axisMin?.[index]}
              max={control.axisMax?.[index]}
              step={control.axisStep?.[index] ?? control.step}
              value={axis}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isNaN(next)) return;
                const copy = axes.slice();
                copy[index] = next;
                write(copy);
              }}
            />
          </label>
        ))}
      </div>
    );
  }
  if (control.kind === "interval") {
    const interval =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as { min: number; max: number })
        : { min: 0, max: 0 };
    const writeInterval = (min: number, max: number) => write({ min, max });
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="w-14 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 font-mono text-neutral-100"
          min={control.min}
          max={control.max}
          step={control.step}
          value={interval.min}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) writeInterval(next, interval.max);
          }}
        />
        <span className="text-neutral-500">…</span>
        <input
          type="number"
          className="w-14 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 font-mono text-neutral-100"
          min={control.min}
          max={control.max}
          step={control.step}
          value={interval.max}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) writeInterval(interval.min, next);
          }}
        />
      </div>
    );
  }
  return (
    <input
      type="text"
      className="w-32 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 font-mono text-neutral-100"
      value={String(value)}
      onChange={(event) => write(event.target.value)}
    />
  );
}

function formatPreview(value: unknown): string {
  if (typeof value === "number") return String(Math.round(value * 1000) / 1000);
  if (Array.isArray(value)) return value.map((entry) => formatPreview(entry)).join(", ");
  if (value !== null && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const TUNABLE_ACRONYMS = new Set([
  "fov",
  "fps",
  "ms",
  "ui",
  "ai",
  "id",
  "uv",
  "rgb",
  "rgba",
  "hp",
  "mp",
  "xp",
  "npc",
  "pvp",
  "pve",
  "rts",
  "hud",
  "lod",
  "gpu",
  "cpu",
]);

function humanizeTunableSegment(segment: string): string {
  if (/^\d+$/.test(segment)) return `#${segment}`;
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => {
      const lower = part.toLowerCase();
      if (TUNABLE_ACRONYMS.has(lower)) return lower.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function tunableGroupTitle(table: string, key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot < 0) return humanizeTunableSegment(table);
  const parent = key.slice(0, dot);
  const parts = parent.split(".").map(humanizeTunableSegment);
  return `${humanizeTunableSegment(table)} · ${parts.join(" · ")}`;
}

function tunableRowLabel(key: string): string {
  const leaf = key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : key;
  return humanizeTunableSegment(leaf);
}

function tunableGroupKey(table: string, key: string): string {
  const dot = key.lastIndexOf(".");
  return dot < 0 ? table : `${table}/${key.slice(0, dot)}`;
}

function deltaSnippet(discovered: readonly DiscoveredEntry[]): string | null {
  const overrides = devtools.overrides.export();
  if (Object.keys(overrides.values).length === 0) return null;
  const discoveredById = new Map(discovered.map((entry) => [entry.id, entry]));
  const tables = new Map<string, Record<string, unknown>>();
  const flat: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(overrides.values)) {
    const entry = discoveredById.get(name);
    if (entry !== undefined) {
      const values = tables.get(entry.table) ?? {};
      values[entry.key] = value;
      tables.set(entry.table, values);
    } else {
      flat[name] = value;
    }
  }
  const parts: string[] = [];
  for (const [table, values] of tables) parts.push(`${table}: ${JSON.stringify(values, null, 2)}`);
  if (Object.keys(flat).length > 0) parts.push(`controls: ${JSON.stringify(flat, null, 2)}`);
  return parts.join("\n\n");
}

function tunableDeltas(
  discovered: readonly DiscoveredEntry[],
): { table: string; key: string; value: unknown }[] {
  const overrides = devtools.overrides.export();
  const discoveredById = new Map(discovered.map((entry) => [entry.id, entry]));
  const deltas: { table: string; key: string; value: unknown }[] = [];
  for (const [name, value] of Object.entries(overrides.values)) {
    const entry = discoveredById.get(name);
    if (entry !== undefined) deltas.push({ table: entry.table, key: entry.key, value });
  }
  return deltas;
}

type SourceSaveState = "idle" | "saving" | "saved" | "partial" | "error";

function SaveToSourceButton({ discovered }: { discovered: readonly DiscoveredEntry[] }) {
  const [state, setState] = useState<SourceSaveState>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const endpoint = getSaveEndpoint();
  if (endpoint === null) return null;
  const deltas = tunableDeltas(discovered);
  const save = () => {
    if (deltas.length === 0 || state === "saving") return;
    setState("saving");
    void fetch(endpoint.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "tunables", gameId: endpoint.gameId, deltas }),
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          ok: boolean;
          applied?: number;
          skipped?: readonly { table: string; key: string; reason: string }[];
          error?: string;
        };
        if (!result.ok) {
          setState("error");
          setDetail(result.error ?? "save failed");
          return;
        }
        const skipped = result.skipped ?? [];
        if (skipped.length > 0) {
          setState("partial");
          setDetail(skipped.map((entry) => `${entry.table}/${entry.key}: ${entry.reason}`).join("\n"));
        } else {
          setState("saved");
          setDetail(null);
        }
        setTimeout(() => setState("idle"), 2500);
      })
      .catch((error: unknown) => {
        setState("error");
        setDetail(error instanceof Error ? error.message : String(error));
      });
  };
  return (
    <button
      type="button"
      disabled={deltas.length === 0}
      className="rounded border border-neutral-600 px-2 py-0.5 text-cyan-300 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent"
      onClick={save}
      title={detail ?? "Write changed values back into the game's source files"}
    >
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved to source"
          : state === "partial"
            ? "Saved (some skipped)"
            : state === "error"
              ? "Save failed"
              : `Save to source${deltas.length > 0 ? ` (${deltas.length})` : ""}`}
    </button>
  );
}

function TunePanel({ gameName }: { gameName: string }) {
  const [deltasCopied, setDeltasCopied] = useState(false);
  const [query, setQuery] = useState("");
  const controls = devtools.controls.list();
  const allDiscovered = devtools.discover.list();
  const persist = () => persistDevtoolsOverrides(gameName);
  const discoveredIds = new Set(allDiscovered.map((entry) => entry.id));
  const needle = query.trim().toLowerCase();
  const matches = (id: string) => needle === "" || id.toLowerCase().includes(needle);
  const discovered = allDiscovered.filter((entry) => entry.enabled || matches(entry.id));
  const explicit = controls.filter((control) => !discoveredIds.has(control.name) && matches(control.name));
  const controlByName = new Map(controls.map((control) => [control.name, control]));
  const snippet = deltaSnippet(allDiscovered);
  const copyDeltas = () => {
    if (snippet === null) return;
    const clipboard = navigator.clipboard;
    if (clipboard !== undefined) {
      void clipboard.writeText(snippet).catch(() => console.log(snippet));
    } else {
      console.log(snippet);
    }
    setDeltasCopied(true);
    setTimeout(() => setDeltasCopied(false), 1500);
  };
  if (controls.length === 0 && allDiscovered.length === 0) {
    return (
      <div className="space-y-2 text-neutral-400">
        <div>Nothing discovered.</div>
        <div className="font-mono text-[10px] text-neutral-500">
          {"export const TUNING = { gravity: -22, skyColor: \"#87ceeb\" };"}
          <br />
          {"Nested numbers/booleans/colors auto-discover. Schema kinds:"}
          <br />
          {"vec2/3/4 · interval · angle · enum · color+alpha via tunable() or scan meta."}
        </div>
      </div>
    );
  }
  const groups = new Map<string, { title: string; entries: DiscoveredEntry[] }>();
  for (const entry of discovered) {
    const groupKey = tunableGroupKey(entry.table, entry.key);
    const existing = groups.get(groupKey);
    if (existing !== undefined) {
      existing.entries.push(entry);
    } else {
      groups.set(groupKey, { title: tunableGroupTitle(entry.table, entry.key), entries: [entry] });
    }
  }
  return (
    <div className="jg-devtools-scroll max-h-72 space-y-3 overflow-auto">
      <div className="flex gap-1.5">
        <button
          type="button"
          className="rounded border border-neutral-600 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
          onClick={() => {
            devtools.controls.resetAll();
            persist();
          }}
        >
          Reset all
        </button>
        <button
          type="button"
          disabled={snippet === null}
          className="rounded border border-neutral-600 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={copyDeltas}
          title="Copy changed values as source snippets to paste upstream"
        >
          {deltasCopied ? "Copied" : "Copy deltas"}
        </button>
        <SaveToSourceButton discovered={allDiscovered} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="filter…"
          className="min-w-0 flex-1 rounded border border-neutral-600 bg-transparent px-2 py-0.5 text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
        />
      </div>
      {explicit.length === 0 && discovered.length === 0 ? (
        <div className="text-neutral-500">No tunables match “{query}”.</div>
      ) : null}
      {explicit.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[9px] uppercase tracking-wide text-neutral-500">registered</div>
          {explicit.map((control) => (
            <div key={control.name} className="flex items-center justify-between gap-3">
              <span className="text-neutral-300" title={control.name}>
                {control.label.includes(".") ? tunableRowLabel(control.label) : control.label}
              </span>
              <ControlInput control={control} onWrite={persist} />
            </div>
          ))}
        </div>
      ) : null}
      {[...groups.entries()].map(([groupKey, group]) => (
        <div key={groupKey} className="space-y-1.5">
          <div className="text-[9px] uppercase tracking-wide text-neutral-500">{group.title}</div>
          {group.entries.map((entry) => {
            const control = entry.enabled ? controlByName.get(entry.id) : undefined;
            return (
              <div key={entry.id} className="flex items-center justify-between gap-3">
                <label className="flex min-w-0 items-center gap-1.5 text-neutral-300" title={entry.id}>
                  <input
                    type="checkbox"
                    className="h-3 w-3 shrink-0 accent-emerald-400"
                    checked={entry.enabled}
                    onChange={(event) => {
                      if (event.target.checked) devtools.discover.enable(entry.id);
                      else devtools.discover.disable(entry.id);
                      persist();
                    }}
                  />
                  <span className="truncate">{tunableRowLabel(entry.key)}</span>
                </label>
                {control !== undefined ? (
                  <ControlInput control={control} onWrite={persist} />
                ) : (
                  <span className="font-mono text-neutral-500">{formatPreview(entry.read())}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

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

export function buildFullReport(playable: PlayableGame): DevtoolsSnapshot & { game: string } {
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
    <div className="pointer-events-auto absolute left-4 top-4 z-50 w-[22rem] rounded border border-neutral-700 bg-neutral-950/95 p-3 text-xs text-neutral-100 shadow-2xl">
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
      {tab === "tune" ? <TunePanel gameName={playable.game.name} /> : null}
      {tab === "col" ? <ColPanel /> : null}
      <div className="mt-2 border-t border-neutral-800 pt-1.5 text-[9px] text-neutral-500">
        F2 toggles · Col = collision · agents: __JG_DEVTOOLS.snapshot() · .collisionDebug
      </div>
    </div>
  );
}
