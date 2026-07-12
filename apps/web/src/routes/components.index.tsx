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

export const Route = createFileRoute("/components/")({
  head: () => ({
    meta: [
      { title: "Components · JGengine" },
      {
        name: "description",
        content:
          "Standalone HUD widgets you can drop into any React project — recolor each one, flip hand-roll vs JGengine, and see the boilerplate you skip. No game.config required.",
      },
    ],
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
    </Page>
  );
}
