import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Page, PageHero, SectionHeading } from "../components/Layout";
import { CopyButton } from "../components/Copy";
import { ArcGauge } from "../../../../registry/jgengine/arc-gauge";
import { ChargeMeter } from "../../../../registry/jgengine/charge-meter";
import { BreakMeter } from "../../../../registry/jgengine/break-meter";
import { LoopDial } from "../../../../registry/jgengine/loop-dial";
import { VitalBar } from "../../../../registry/jgengine/vital-bar";
import type { VitalTone } from "../../../../registry/jgengine/vital-bar";
import { HudPanel } from "../../../../registry/jgengine/hud-panel";
import { emberVars } from "../../../../registry/jgengine/jg-theme";
import { seo } from "../lib/seo";

export const Route = createFileRoute("/components/")({
  head: () =>
    seo({
      title: "Components · JGengine",
      description:
        "Standalone HUD widgets you can drop into any React project — recolor each one, flip hand-roll vs JGengine, and see the boilerplate you skip. No game.config required.",
      path: "/components",
    }),
  component: ComponentsIndex,
});

const EMBER = emberVars as Record<string, string>;
const RAW = import.meta.glob<string>("../../../../registry/jgengine/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

function srcFor(file: string): string {
  const key = Object.keys(RAW).find((k) => k.endsWith(`/${file}`));
  return key ? RAW[key] : "";
}

function nonEmpty(source: string): number {
  return source.split("\n").filter((line) => line.trim().length > 0).length;
}

function toneLabel(tone: string): string {
  return tone === "health" ? "HP" : tone === "mana" ? "MP" : tone.toUpperCase();
}

interface StoredState {
  toggles: Record<string, "handroll" | "jgengine">;
  seen: boolean;
}
const STORE_KEY = "jg-components-v1";
function readStore(): StoredState {
  if (typeof window === "undefined") return { toggles: {}, seen: false };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredState) : null;
    return parsed && parsed.toggles ? parsed : { toggles: {}, seen: false };
  } catch {
    return { toggles: {}, seen: false };
  }
}
function writeStore(state: StoredState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable */
  }
}

type Params = Record<string, number | string | boolean>;

interface ControlDef {
  key: string;
  label: string;
  kind: "range" | "toggle" | "chips";
  options?: readonly string[];
}
interface ColorDef {
  v: string;
  label: string;
}
interface WidgetDef {
  id: string;
  name: string;
  file: string;
  desc: string;
  initial: Params;
  colors: readonly ColorDef[];
  controls: readonly ControlDef[];
  preview: (params: Params, style: CSSProperties) => ReactNode;
  usage: (params: Params) => string;
}

const WIDGETS: readonly WidgetDef[] = [
  {
    id: "arc-gauge",
    name: "ArcGauge",
    file: "arc-gauge.tsx",
    desc: "A 240° swept dial with tick marks and a center readout. The classic speedometer / tachometer.",
    initial: { fraction: 0.72, tone: "accent" },
    colors: [
      { v: "--jg-accent", label: "accent" },
      { v: "--jg-warning", label: "warning" },
      { v: "--jg-danger", label: "danger" },
      { v: "--jg-edge", label: "edge" },
      { v: "--jg-text", label: "text" },
    ],
    controls: [
      { key: "fraction", label: "fraction", kind: "range" },
      { key: "tone", label: "tone", kind: "chips", options: ["accent", "warning", "danger"] },
    ],
    preview: (p, style) => {
      const f = p.fraction as number;
      return (
        <div style={style}>
          <ArcGauge fraction={f} readout={String(Math.round(f * 220))} label="km/h" tone={p.tone as "accent" | "danger" | "warning"} size={140} />
        </div>
      );
    },
    usage: (p) =>
      `import { ArcGauge } from "@/components/ui/arc-gauge";\n\n// A speedometer — wired to your own state\n<ArcGauge\n  fraction={${(p.fraction as number).toFixed(2)}}\n  readout="${Math.round((p.fraction as number) * 220)}"\n  label="km/h"\n  tone="${p.tone as string}"\n/>`,
  },
  {
    id: "charge-meter",
    name: "ChargeMeter",
    file: "charge-meter.tsx",
    desc: "A slanted charge bar with tier ticks. Glows and pulses the moment it's ready to fire.",
    initial: { fraction: 0.9, ready: false },
    colors: [
      { v: "--jg-accent", label: "accent" },
      { v: "--jg-accent-deep", label: "accent deep" },
      { v: "--jg-surface", label: "surface" },
      { v: "--jg-surface-deep", label: "surface deep" },
    ],
    controls: [
      { key: "fraction", label: "fraction", kind: "range" },
      { key: "ready", label: "ready", kind: "toggle" },
    ],
    preview: (p, style) => {
      const f = p.fraction as number;
      return (
        <div style={style}>
          <ChargeMeter fraction={f} ready={(p.ready as boolean) || f >= 1} tiers={[0.33, 0.66]} label="Ultimate" width={210} />
        </div>
      );
    },
    usage: (p) =>
      `import { ChargeMeter } from "@/components/ui/charge-meter";\n\n<ChargeMeter\n  fraction={${(p.fraction as number).toFixed(2)}}\n  ready={charge >= 1}\n  tiers={[0.33, 0.66]}\n  label="Ultimate"\n/>`,
  },
  {
    id: "break-meter",
    name: "BreakMeter",
    file: "break-meter.tsx",
    desc: "A chevron stress gauge. Colors ramp grey → amber → red, then shakes and pulses when it breaks.",
    initial: { fraction: 0.5, broken: false },
    colors: [
      { v: "--jg-danger", label: "danger" },
      { v: "--jg-warning", label: "warning" },
      { v: "--jg-text-dim", label: "idle" },
      { v: "--jg-surface-deep", label: "track" },
    ],
    controls: [
      { key: "fraction", label: "fraction", kind: "range" },
      { key: "broken", label: "broken", kind: "toggle" },
    ],
    preview: (p, style) => (
      <div style={style}>
        <BreakMeter fraction={p.fraction as number} broken={p.broken as boolean} width={210} />
      </div>
    ),
    usage: (p) =>
      `import { BreakMeter } from "@/components/ui/break-meter";\n\n// Ramps grey → amber → red, shakes on break\n<BreakMeter fraction={${(p.fraction as number).toFixed(2)}} broken={${p.broken as boolean}} />`,
  },
  {
    id: "loop-dial",
    name: "LoopDial",
    file: "loop-dial.tsx",
    desc: "Positions around a repeating cycle — racers on a lap, patrols on a route. Live and forecast arcs.",
    initial: { lead: 0.2 },
    colors: [
      { v: "--jg-accent", label: "accent" },
      { v: "--jg-danger", label: "danger" },
      { v: "--jg-warning", label: "warning" },
      { v: "--jg-edge", label: "ring" },
    ],
    controls: [{ key: "lead", label: "lead·at", kind: "range" }],
    preview: (p, style) => (
      <div style={style}>
        <LoopDial
          size={150}
          readout="L2"
          label="Lap"
          markers={[
            { id: "you", at: p.lead as number, glyph: "1", emphasis: true },
            { id: "rival", at: 0.62, glyph: "2" },
            { id: "hazard", at: 0.85, glyph: "!", tone: "danger" },
          ]}
          arcs={[
            { from: 0.1, to: 0.35, tone: "danger" },
            { from: 0.5, to: 0.65, tone: "warning", forecast: true },
          ]}
        />
      </div>
    ),
    usage: (p) =>
      `import { LoopDial } from "@/components/ui/loop-dial";\n\n<LoopDial\n  markers={[\n    { id: "you",   at: ${(p.lead as number).toFixed(2)}, glyph: "1", emphasis: true },\n    { id: "rival", at: 0.62, glyph: "2" },\n  ]}\n  arcs={[{ from: 0.1, to: 0.35, tone: "danger" }]}\n  readout="L2"\n  label="Lap"\n/>`,
  },
  {
    id: "vital-bar",
    name: "VitalBar",
    file: "vital-bar.tsx",
    desc: "The health/mana/stamina bar. Slanted, segmented, with a ghost trail on loss and typed color tones.",
    initial: { level: 0.72, tone: "health" },
    colors: [
      { v: "--jg-health", label: "health" },
      { v: "--jg-mana", label: "mana" },
      { v: "--jg-stamina", label: "stamina" },
      { v: "--jg-xp", label: "xp" },
      { v: "--jg-shield", label: "shield" },
    ],
    controls: [
      { key: "level", label: "current", kind: "range" },
      { key: "tone", label: "tone", kind: "chips", options: ["health", "mana", "stamina", "xp", "shield"] },
    ],
    preview: (p, style) => (
      <div style={style}>
        <VitalBar value={{ current: Math.round((p.level as number) * 100), max: 100 }} tone={p.tone as VitalTone} label={toneLabel(p.tone as string)} segments={4} width={240} />
      </div>
    ),
    usage: (p) =>
      `import { VitalBar } from "@/components/ui/vital-bar";\n\n<VitalBar\n  value={{ current: ${Math.round((p.level as number) * 100)}, max: 100 }}\n  tone="${p.tone as string}"\n  label="${toneLabel(p.tone as string)}"\n  segments={4}\n/>`,
  },
  {
    id: "hud-panel",
    name: "HudPanel",
    file: "hud-panel.tsx",
    desc: "A corner-bracket frame with a titled header. The container the other widgets sit inside — pure composition.",
    initial: { hp: 0.72, mp: 0.66 },
    colors: [
      { v: "--jg-accent", label: "accent" },
      { v: "--jg-edge", label: "edge" },
      { v: "--jg-surface", label: "surface" },
      { v: "--jg-text", label: "text" },
    ],
    controls: [
      { key: "hp", label: "hp", kind: "range" },
      { key: "mp", label: "mp", kind: "range" },
    ],
    preview: (p, style) => (
      <div style={style}>
        <HudPanel title="Status" width={260}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <VitalBar value={{ current: Math.round((p.hp as number) * 100), max: 100 }} tone="health" label="HP" width="100%" segments={4} />
            <VitalBar value={{ current: Math.round((p.mp as number) * 60), max: 60 }} tone="mana" label="MP" width="100%" />
          </div>
        </HudPanel>
      </div>
    ),
    usage: (p) =>
      `import { HudPanel } from "@/components/ui/hud-panel";\nimport { VitalBar } from "@/components/ui/vital-bar";\n\n<HudPanel title="Status" width={260}>\n  <VitalBar value={{ current: ${Math.round((p.hp as number) * 100)}, max: 100 }} tone="health" label="HP" />\n  <VitalBar value={{ current: ${Math.round((p.mp as number) * 60)}, max: 60 }} tone="mana" label="MP" />\n</HudPanel>`,
  },
];

const PILL_ON = "border-[#e3b054] bg-[#e3b054] font-bold text-[#17120b]";
const PILL_OFF = "border-white/15 text-slate-400 hover:text-slate-200";

function WidgetBay({ def, showArrow, onInteract }: { def: WidgetDef; showArrow: boolean; onInteract: () => void }) {
  const source = srcFor(def.file);
  const loc = nonEmpty(source);
  const [params, setParams] = useState<Params>(() => ({ ...def.initial }));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"handroll" | "jgengine">("handroll");

  useEffect(() => {
    if (readStore().toggles[def.id] === "jgengine") setMode("jgengine");
  }, [def.id]);

  const jg = mode === "jgengine";
  const vars = { ...emberVars, ...overrides } as CSSProperties;
  const usageStr = def.usage(params);
  const usageLoc = nonEmpty(usageStr);
  const shownCode = jg ? usageStr : source;
  const colorOf = (v: string) => overrides[v] ?? EMBER[v] ?? "#ffffff";

  const setParam = (key: string, value: number | string | boolean) => setParams((prev) => ({ ...prev, [key]: value }));

  const onToggle = () => {
    const next = jg ? "handroll" : "jgengine";
    setMode(next);
    const store = readStore();
    store.toggles[def.id] = next;
    store.seen = true;
    writeStore(store);
    onInteract();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex flex-col gap-1.5 border-b border-white/[0.08] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-mono text-lg text-slate-100">{def.name}</h3>
          <span className="rounded-full border border-[#e3b054]/30 bg-[#e3b054]/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#e3b054]">standalone</span>
          <span className="font-mono text-xs text-slate-600">{def.file}</span>
        </div>
        <p className="text-sm text-slate-400">{def.desc}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div
          className="relative flex min-w-0 flex-col items-center justify-center gap-5 border-b border-white/[0.08] bg-[#07080b] p-5 lg:border-b-0 lg:border-r"
          style={{ backgroundImage: "radial-gradient(420px 260px at 50% 25%, rgba(74,134,216,0.10), transparent 62%)" }}
        >
          <div className="flex min-h-[130px] max-w-full items-center justify-center">{def.preview(params, vars)}</div>
          <div className="flex w-full max-w-[320px] flex-col gap-3">
            {def.controls.map((control) => {
              if (control.kind === "range") {
                return (
                  <div key={control.key} className="flex items-center gap-3">
                    <label className="min-w-[58px] font-mono text-[10px] uppercase tracking-wider text-slate-400">{control.label}</label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={params[control.key] as number}
                      onChange={(e) => setParam(control.key, Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer accent-[#e3b054]"
                      aria-label={control.label}
                    />
                    <span className="w-10 text-right font-mono text-xs tabular-nums text-[#e3b054]">{(params[control.key] as number).toFixed(2)}</span>
                  </div>
                );
              }
              if (control.kind === "toggle") {
                const on = params[control.key] as boolean;
                return (
                  <div key={control.key} className="flex items-center gap-3">
                    <label className="min-w-[58px] font-mono text-[10px] uppercase tracking-wider text-slate-400">{control.label}</label>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setParam(control.key, !on)}
                      className={`ml-auto rounded-full border px-3 py-1 font-mono text-[11px] transition ${on ? PILL_ON : PILL_OFF}`}
                    >
                      {control.label}
                    </button>
                  </div>
                );
              }
              return (
                <div key={control.key} className="flex items-center gap-3">
                  <label className="min-w-[58px] font-mono text-[10px] uppercase tracking-wider text-slate-400">{control.label}</label>
                  <div className="ml-auto flex flex-wrap justify-end gap-1.5">
                    {(control.options ?? []).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={params[control.key] === opt}
                        onClick={() => setParam(control.key, opt)}
                        className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${params[control.key] === opt ? PILL_ON : PILL_OFF}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="border-b border-white/[0.08] p-4">
            <p className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-slate-600">Recolor — this component only</p>
            <div className="flex flex-wrap gap-2.5">
              {def.colors.map((color) => (
                <label
                  key={color.v}
                  title={color.label}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 py-1 pl-1.5 pr-2.5 transition hover:border-white/20"
                >
                  <input
                    type="color"
                    className="sr-only"
                    value={colorOf(color.v)}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [color.v]: e.target.value }))}
                    aria-label={`${color.label} color`}
                  />
                  <span className="h-7 w-7 rounded-md border border-white/20" style={{ background: colorOf(color.v) }} />
                  <span className="font-mono text-xs uppercase tabular-nums text-slate-400">{colorOf(color.v)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={`transition ${jg ? "bg-[linear-gradient(180deg,rgba(227,176,84,0.055),transparent_42%)] shadow-[inset_3px_0_0_#e3b054]" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-3 sm:px-4">
              <div className="flex min-w-0 items-baseline gap-2 font-mono">
                <span className={`text-xl font-extrabold tabular-nums transition-colors ${jg ? "text-white [text-shadow:0_0_15px_rgba(227,176,84,0.6)]" : "text-slate-300"}`}>{jg ? usageLoc : loc}</span>
                <span className={`text-xs transition-colors ${jg ? "text-[#e3b054]" : "text-slate-600"}`}>{jg ? "lines for a ready-to-use component" : "lines of boilerplate"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {showArrow && !jg && (
                  <span className="flex animate-pulse items-center gap-1.5 whitespace-nowrap font-mono text-xs text-[#e3b054]">
                    <span className="uppercase tracking-wider">flip it</span>
                    <span className="text-base">➜</span>
                  </span>
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={jg}
                  onClick={onToggle}
                  className="relative inline-flex h-[30px] items-center overflow-hidden rounded-full border border-white/15 bg-black/40 font-mono text-[11px]"
                >
                  <span className={`relative z-10 px-3 leading-[30px] transition-colors ${jg ? "text-slate-400" : "text-slate-100"}`}>Hand-roll</span>
                  <span className={`relative z-10 px-3 leading-[30px] transition-colors ${jg ? "font-bold text-[#17120b]" : "text-slate-400"}`}>JGengine</span>
                  <span
                    className={`absolute inset-y-0.5 z-0 w-[calc(50%-2px)] rounded-full transition-all duration-300 ${jg ? "left-1/2 bg-gradient-to-b from-[#e3b054] to-[#8a6425] shadow-[0_0_12px_rgba(227,176,84,0.55)]" : "left-0.5 bg-gradient-to-b from-[#3a2f1d] to-[#241d12]"}`}
                  />
                </button>
                <CopyButton value={shownCode} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <pre className="max-h-[360px] overflow-y-auto bg-black/30 p-4 font-mono text-[12px] leading-relaxed text-slate-300">
                <code>{shownCode}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS: readonly { n: string; title: string; body: string }[] = [
  { n: "01 — Import", title: "One line", body: "Copy the file or pull it in. Either way you didn't author it." },
  { n: "02 — Props", title: "Feed it numbers", body: "A speed, an HP, a cooldown. Wire your own state to a prop." },
  { n: "03 — Skip the rest", title: "Already written", body: "SVG math, clamps, tick marks, animation, ARIA roles — in our file, not yours." },
];

interface SystemDef {
  id: string;
  pkg: string;
  name: string;
  headline: string;
  builds: readonly string[];
  usage: string;
  handRoll: string;
  handRollLoc: number;
  fileCount: number;
  files: string;
}

const SYSTEMS: readonly SystemDef[] = [
  {
    id: "server",
    pkg: "@jgengine/node · ws",
    name: "Authoritative multiplayer server",
    headline: "A whole authoritative game server — socket, rooms, tick, reconnection, persistence — in three constructor calls.",
    builds: [
      "A WebSocket server: auth handshake, RPC framing, per-channel fan-out",
      "Client reconnection, exponential backoff, RPC timeout + retry",
      "Room routing, slot capacity, join-by-code / browse matchmaking",
      "An authoritative tick loop broadcasting state diffs to subscribers",
      "Save flushing wired to the tick without blocking it",
    ],
    usage: `import { createGameHost, createGameWsServer, filePersistence } from "@jgengine/node";
import { createGameRuntime } from "@jgengine/core";

const runtime = createGameRuntime({ gameId: "arena", save: { auto: "5s", scope: "player" }, commands });
const host = createGameHost({ runtimes: [runtime], persistence: filePersistence("./saves"), tickMs: 100 });
createGameWsServer({ host, port: 8080, path: "/play" });
// client: createWsBackend({ url, userId }) — reconnect + live server/player/feed channels`,
    handRoll: `// ─── host.ts — the authoritative tick + autosave loop ───
for (const entry of live.values()) {
  if (entry.record.status !== "running") continue;
  if (entry.record.memberUserIds.length === 0) continue;
  const elapsedMs = timestamp - entry.record.tickAnchorMs;
  if (elapsedMs < tickMs) continue;

  const before = entry.snapshot.revision;
  entry.snapshot = resolveRuntime(entry.record.gameId).tick(entry.snapshot, elapsedMs / 1_000);
  if (entry.snapshot.revision !== before) {
    markMutated(entry);
    emit({ type: "server", serverId: entry.record.serverId });
  }
  if (shouldAutoSave(entry.record.save, entry.record.dirtyAt, entry.record.lastSavedAt, timestamp)) {
    await flushServer(entry);
  }
}

// ─── persistence.ts — crash-safe save: stage to a temp file, then rename ───
async function writeJson(path: string, value: unknown): Promise<void> {
  const temp = \`\${path}.\${randomUUID()}.tmp\`;
  await writeFile(temp, JSON.stringify(value), "utf8");
  await rename(temp, path);
}`,
    handRollLoc: 760,
    fileCount: 3,
    files: "host.ts · wsServer.ts · persistence.ts",
  },
  {
    id: "runtime",
    pkg: "@jgengine/core",
    name: "Authoritative command runtime",
    headline: "Server-authoritative logic becomes a plain object of pure validate-then-apply functions — no dispatcher, no concurrency plumbing.",
    builds: [
      "A command / intent validation layer with structured rejections",
      "A deterministic reducer dispatch over authoritative state",
      "Dirty-tracking so persistence and sync only touch what changed",
      "A revision / OCC scheme that rejects stale writes",
      "A fixed-step server tick that composes with commands",
    ],
    usage: `import { createGameRuntime, type CommandDef } from "@jgengine/core";

const move: CommandDef<{ x: number; z: number }> = {
  validate: (snap, input, uid) => (input.x > 100 ? { reason: "out-of-bounds" } : null),
  apply: (snap, input, uid) => markPlayerDirty(placePlayer(snap, uid, input), uid),
};
const runtime = createGameRuntime({ gameId: "arena", commands: { move },
  loop: { onTick: (ctx, dt) => stepEnemies(ctx.snapshot, dt) } });`,
    handRoll: `// ─── commandRunner.ts — validate → apply → bump revision → track dirty ───
const command = commands[commandName];
if (!command) return { ok: false, reason: \`Unknown command: \${commandName}\` };
const validationError = command.validate(snapshot, input, actorUserId);
if (validationError) return { ok: false, reason: validationError.reason };
const next = command.apply(snapshot, input, actorUserId);
return {
  ok: true,
  snapshot: { ...next, revision: snapshot.revision + 1, dirty: {
    server: true,
    players: next.dirty.players.includes(actorUserId)
      ? next.dirty.players
      : [...next.dirty.players, actorUserId],
    chunks: next.dirty.chunks,
  } },
};

// ─── snapshot.ts — mark one player dirty so only they get persisted/synced ───
export function markPlayerDirty(snapshot: GameRuntimeSnapshot, userId: string) {
  if (snapshot.dirty.players.includes(userId)) return markServerDirty(snapshot);
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    dirty: { ...snapshot.dirty, server: true, players: [...snapshot.dirty.players, userId] },
  };
}`,
    handRollLoc: 352,
    fileCount: 3,
    files: "gameRuntime.ts · commandRunner.ts · snapshot.ts",
  },
  {
    id: "spatial",
    pkg: "@jgengine/core",
    name: "Entity store + spatial queries",
    headline: "“What's near X” — registry, grid broadphase, radius / cone / line-of-sight — is two factory calls, not a spatial-partitioning library.",
    builds: [
      "An entity registry: stable IDs, lifecycle, pose + velocity derivation",
      "A uniform-grid broadphase that rebuilds each tick",
      "Radius, cone, and line-of-sight queries with fallbacks",
      "O(n²) neighbor loops replaced by grid-bucketed pair iteration",
      "A change-subscription layer for renderers",
    ],
    usage: `import { createEntityStore } from "@jgengine/core/scene/entityStore";
import { createSpatialApi } from "@jgengine/core/scene/spatial";

const entities = createEntityStore();
entities.spawn("goblin", { position: [3, 0, 5], role: "npc" });
const spatial = createSpatialApi({
  resolvePosition: (id) => entities.get(id)?.position,
  candidates: () => entities.list().map((e) => e.id),
  grid: { cellSize: 8 },
});
const nearby = spatial.inRadius([0, 0, 0], 12);
const inCone = spatial.queryArc({ from: "player", aim, radius: 10, halfAngleDeg: 45 });`,
    handRoll: `// ─── spatialGrid.ts — counting-sort rebuild of the uniform grid ───
rebuild(count: number, xs: Float32Array, zs: Float32Array): void {
  const start = this.cellStart;
  start.fill(0);
  for (let i = 0; i < count; i += 1) {
    const c = this.cellZ(zs[i]!) * this.nx + this.cellX(xs[i]!);
    this.cellOfBody[i] = c;
    start[c + 1]! += 1;
  }
  for (let c = 0; c < this.numCells; c += 1) {
    start[c + 1]! += start[c]!;
    this.cursor[c] = start[c]!;
  }
  for (let i = 0; i < count; i += 1) this.sorted[this.cursor[this.cellOfBody[i]!]!++] = i;
}

// ─── spatial.ts — gather candidate ids from the cells a radius overlaps ───
function collectNear(index, centerX, centerZ, radius, out): void {
  const size = cellSize!;
  out.length = 0;
  const seen = collectNearSeen;
  seen.clear();
  for (let cz = cellCoord(centerZ - radius, size); cz <= cellCoord(centerZ + radius, size); cz += 1) {
    for (let cx = cellCoord(centerX - radius, size); cx <= cellCoord(centerX + radius, size); cx += 1) {
      const bucket = index.cells.get(packCell(cx, cz));
      if (bucket === undefined) continue;
      for (const id of bucket) if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
  }
}`,
    handRollLoc: 631,
    fileCount: 3,
    files: "entityStore.ts · spatial.ts · spatialGrid.ts",
  },
  {
    id: "combat",
    pkg: "@jgengine/core · combat",
    name: "Combat resolution pipeline",
    headline: "Hitreg, resistances, AoE gather, projectile settlement, death-to-loot — four composed systems, not a bespoke combat engine.",
    builds: [
      "A damage pipeline: magnitude → resistances / immunities → clamp → lethal check",
      "AoE target gathering against a spatial index (cone / circle / line)",
      "Projectile prediction + raycast settlement against colliders",
      "Death → loot-table rolls → drop grants / world drops → respawn",
      "Consistent hit results feeding HUD and feed events",
    ],
    usage: `import { createEffectSystem } from "@jgengine/core/combat/effects";
import { createProjectileSystem } from "@jgengine/core/combat/projectiles";

const effects = createEffectSystem({ resolveReceive, resolveStats, getStat, spatial });
const projectiles = createProjectileSystem({ effects, spatial, getStat, sceneRaycast });
const shot = projectiles.fireProjectile({ from: "player", item: "bow", aim });
const result = projectiles.settleProjectile(shot); // { status, hits: EffectResult[] }`,
    handRoll: `// ─── effects.ts — drain an ordered stack of pools, flag lethality ───
function drainPools(instanceId, effect, rule, stats, drainMagnitude): EffectResult {
  const applied: AppliedPoolDelta[] = [];
  const lastStatId = rule.order[rule.order.length - 1];
  let remaining = drainMagnitude, lethal = false;
  for (const statId of rule.order) {
    if (remaining === 0) break;
    const before = stats[statId];
    if (before === undefined) continue;
    const result = applyPoolDelta(stats, statId, -remaining);
    if (result.status === "rejected") continue;
    stats[statId] = result.stat;
    const delta = result.stat.current - before.current;
    if (delta !== 0) applied.push({ statId, delta });
    remaining += delta;
    if (statId === lastStatId && drainMagnitude > 0 && result.hitMin) lethal = true;
  }
  return { instanceId, effect, applied, lethal };
}

// ─── projectiles.ts — settle a shot: raycast, then keep only valid hits ───
const { visible, rawHits } = predictHits(input);
const impact = firstImpact(hitsUntilBlocked(asSceneHits(rawHits)));
const solidBlock = impact !== null && impact.blocks && !impact.damageEligible;
const damageHits = visible.filter((hit): hit is EntityRaycastHit =>
  isEntityHit(hit) && hit.damageEligible !== false &&
  (!solidBlock || hit.distance <= (impact?.distance ?? Infinity) + 1e-9) &&
  deps.effects.canReceive(hit.instanceId, input.effect) === null);`,
    handRollLoc: 863,
    fileCount: 4,
    files: "effects.ts · projectiles.ts · resistance.ts · death.ts",
  },
  {
    id: "persistence",
    pkg: "@jgengine/core · sql",
    name: "Persistence, autosave & snapshots",
    headline: "How your world gets saved — schema, serialization, dirty-tracking, autosave, pluggable Postgres/file/memory — is one persistence: argument.",
    builds: [
      "A DB schema + migrations: servers, player profiles, world chunks, boards",
      "Serialize / hydrate authoritative state on save and load",
      "Dirty-tracking so you don't rewrite the whole world each tick",
      "Autosave cadence + debounce tied to the tick loop",
      "A swappable backend: dev memory → file → SQL behind one interface",
    ],
    usage: `import { sqlPersistence, ensureSchema } from "@jgengine/sql";
import { createGameHost } from "@jgengine/node";

await ensureSchema(pool);
createGameHost({ runtimes, persistence: sqlPersistence(pool) });
// or filePersistence(dir) / memoryPersistence() — same contract
createGameRuntime({ gameId, save: { auto: "10s", scope: "player+chunks" }, commands });`,
    handRoll: `// ─── hostPersistence.ts — split each player, emit only dirty profiles ───
const sessionPlayers: Record<string, RuntimePlayerRow> = {};
const profiles: PlayerProfileRecord[] = [];
for (const userId of Object.keys(snapshot.players)) {
  const player = snapshot.players[userId];
  if (!player) continue;
  const { persistent, session } = splitProfilePlayer(player);
  sessionPlayers[userId] = { ...persistent, session };
  if (
    isSaveEnabled(save) &&
    saveScopeIncludesPlayer(save.scope) &&
    snapshot.dirty.players.includes(userId)
  ) {
    profiles.push(/* … serialized profile row … */);
  }
}

// ─── sqlPersistence.ts — one of the backends behind that one interface ───
async function upsertProfile(db: SqlQueryable, record: PlayerProfileRecord): Promise<void> {
  await db.query(
    \`INSERT INTO jg_player_profiles (game_id, user_id, updated_at, record)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (game_id, user_id) DO UPDATE SET
       updated_at = EXCLUDED.updated_at, record = EXCLUDED.record\`,
    [record.gameId, record.userId, record.updatedAt, JSON.stringify(record)],
  );
}`,
    handRollLoc: 982,
    fileCount: 4,
    files: "hostPersistence.ts · snapshot.ts · sqlPersistence.ts · persistence.ts",
  },
  {
    id: "leaderboards",
    pkg: "@jgengine/convex",
    name: "Hosted leaderboards",
    headline: "Global / server / personal ranked boards with live updates — one exported Convex module plus a client read helper.",
    builds: [
      "A board table keyed by (game, stat, scope, server), upsert-on-increment",
      "Ranked top-N queries with limit + scope filtering",
      "Increment aggregation batched off the game tick",
      "Realtime subscriptions so the board updates live",
      "Per-profile stat rollups for a player's own standing",
    ],
    usage: `// Convex backend module:
import { createLeaderboardFunctions } from "@jgengine/convex";
export const { getTop } = createLeaderboardFunctions({ auth: "anonymous" });

// Client — reactive top-N:
import { createConvexLeaderboardReads } from "@jgengine/convex";
const reads = createConvexLeaderboardReads(api, { gameId: "arena" });
const { query, args } = reads.getTop({ stat: "kills", scope: "global", limit: 20 });`,
    handRoll: `// ─── convex/server.ts — find-or-insert a board row, per scope ───
for (const entry of entries) {
  const serverId = entry.serverId as GenericId<"jgGameServers"> | undefined;
  const candidates = await ctx.db.query("jgLeaderboardRows")
    .withIndex("by_user_scope_stat", (q) =>
      q.eq("userId", entry.userId).eq("scope", entry.scope).eq("stat", entry.stat))
    .collect();
  const existing = candidates.find((row) => row.gameId === gameId && row.serverId === serverId);
  if (existing) {
    await ctx.db.patch(existing._id, { value: existing.value + entry.by, updatedAt: now });
  } else {
    await ctx.db.insert("jgLeaderboardRows", {
      gameId, stat: entry.stat, scope: entry.scope,
      serverId, userId: entry.userId, value: entry.by, updatedAt: now,
    });
  }
}

// ─── leaderboard.ts — the ranked top-N read (sort + slice) ───
getTop(stat, options) {
  return Array.from(rows.values())
    .filter((row) => row.stat === stat && row.scope === options.scope && row.serverId === options.serverId)
    .sort((a, b) => b.value - a.value)
    .slice(0, options.limit ?? 10)
    .map((row) => ({ userId: row.userId, value: row.value }));
}`,
    handRollLoc: 201,
    fileCount: 2,
    files: "leaderboard.ts · convex/server.ts",
  },
];

function SystemCard({ sys }: { sys: SystemDef }) {
  const usageLoc = nonEmpty(sys.usage);
  const [jg, setJg] = useState(true);
  const code = jg ? sys.usage : sys.handRoll;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex flex-col gap-2 border-b border-white/[0.08] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full border border-[#e3b054]/30 bg-[#e3b054]/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#e3b054]">{sys.pkg}</span>
          <h3 className="font-mono text-lg text-slate-100">{sys.name}</h3>
        </div>
        <p className="text-sm text-slate-300">{sys.headline}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="min-w-0 border-b border-white/[0.08] bg-[#0c0a08] p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-slate-600">The subsystem you skip</p>
          <ul className="flex flex-col gap-2.5">
            {sys.builds.map((item) => (
              <li key={item} className="flex gap-2.5 text-[13px] leading-snug text-slate-400">
                <span className="mt-px text-slate-600">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={`flex min-w-0 flex-col transition ${jg ? "bg-[linear-gradient(180deg,rgba(227,176,84,0.05),transparent_45%)] shadow-[inset_3px_0_0_#e3b054]" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <div className="flex min-w-0 items-baseline gap-2 font-mono">
              <span className={`text-xl font-extrabold tabular-nums transition-colors ${jg ? "text-white [text-shadow:0_0_15px_rgba(227,176,84,0.6)]" : "text-slate-300"}`}>{jg ? usageLoc : `~${sys.handRollLoc}`}</span>
              <span className={`text-xs transition-colors ${jg ? "text-[#e3b054]" : "text-slate-600"}`}>{jg ? "lines with JGengine" : `lines to hand-roll · ${sys.fileCount} files`}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={jg}
                onClick={() => setJg((v) => !v)}
                className="relative inline-flex h-[30px] items-center overflow-hidden rounded-full border border-white/15 bg-black/40 font-mono text-[11px]"
              >
                <span className={`relative z-10 px-3 leading-[30px] transition-colors ${jg ? "text-slate-400" : "text-slate-100"}`}>Hand-roll</span>
                <span className={`relative z-10 px-3 leading-[30px] transition-colors ${jg ? "font-bold text-[#17120b]" : "text-slate-400"}`}>JGengine</span>
                <span className={`absolute inset-y-0.5 z-0 w-[calc(50%-2px)] rounded-full transition-all duration-300 ${jg ? "left-1/2 bg-gradient-to-b from-[#e3b054] to-[#8a6425] shadow-[0_0_12px_rgba(227,176,84,0.55)]" : "left-0.5 bg-gradient-to-b from-[#3a2f1d] to-[#241d12]"}`} />
              </button>
              <CopyButton value={code} />
            </div>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <pre className="max-h-[360px] overflow-y-auto p-4 font-mono text-[11.5px] leading-relaxed text-slate-300">
              <code>{code}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComponentsIndex() {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (readStore().seen) setSeen(true);
  }, []);

  return (
    <Page>
      <PageHero
        eyebrow="Bring-anywhere · presentational tier"
        title="Import the HUD. Don't hand-roll it."
        blurb="These HUD instruments are pure React — one import and a few props. No defineGame(), no GameProvider, nothing from @jgengine/core. Recolor each one, then flip it from hand-roll to JGengine to see the boilerplate you skip."
      >
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="font-mono text-xs text-[#e3b054]">{step.n}</div>
              <div className="mt-1.5 font-medium text-slate-100">{step.title}</div>
              <p className="mt-1 text-sm text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <SectionHeading
          eyebrow="The catalog"
          title="Six instruments · what you write vs what we did"
          blurb="Drag the sliders — the preview and your usage code update together. Each card shows the handful of lines you write against the full file we already wrote."
        />
        <div className="mt-8 flex flex-col gap-6">
          {WIDGETS.map((def, index) => (
            <WidgetBay key={def.id} def={def} showArrow={index === 0 && !seen} onInteract={() => setSeen(true)} />
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-[#e3b054]/20 bg-[#e3b054]/[0.04] p-6">
          <p className="font-mono text-xs uppercase tracking-wider text-[#e3b054]">What you actually ship with</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
            <li>
              <span className="text-emerald-400">✓</span> React 19 as a peer dependency — that's it for runtime.
            </li>
            <li>
              <span className="text-emerald-400">✓</span> A short list of <code className="font-mono text-[#e3b054]">--jg-*</code> CSS variables per widget. Defaults provided; override for your brand.
            </li>
            <li>
              <span className="text-slate-600">✗</span> No <code className="font-mono text-slate-300">@jgengine/core</code>, no <code className="font-mono text-slate-300">defineGame()</code>, no <code className="font-mono text-slate-300">GameProvider</code>.
            </li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <SectionHeading
          eyebrow="The real leverage"
          title="Systems, not just widgets"
          blurb="A gauge saves you an afternoon. These save you the subsystem. Flip any card to Hand-roll to see the real implementation — the hundreds of lines, across the actual files, that a few JGengine calls stand in for. This is the 10× that compounds across games."
        />
        <div className="mt-8 flex flex-col gap-6">
          {SYSTEMS.map((sys) => (
            <SystemCard key={sys.id} sys={sys} />
          ))}
        </div>
      </section>
    </Page>
  );
}
