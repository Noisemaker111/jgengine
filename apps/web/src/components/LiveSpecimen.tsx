import { useEffect, useRef, useState } from "react";

import { GRASS_PRESETS, GRASS_SCHEMA } from "@jgengine/core/grass/grassKind";

import type { DialSet, DialValue } from "../live/liveCode";
import { createTrace, type Trace } from "../live/trace";

/**
 * Client-only wrapper for the interactive demos across the site. Each demo module is pulled in
 * with a dynamic `import()` inside an effect, so nothing three- or canvas-related runs during SSR. A demo
 * exposes `setDials(dials)` + `dispose()`, runs on its own until the visitor takes over, and reports
 * what it is doing through a {@link Trace} so the code beside it can light up.
 */

import type { DemoKey } from "../live/demoParts";

type Dials = Record<string, DialValue>;

interface SpecimenInstance {
  setDials(dials: Dials): void;
  dispose(): void;
}

interface ChoiceOption {
  value: string;
  label: string;
  /** Other dials this choice sets at the same time (a style's grip and drift). */
  patch?: Dials;
}

type Control =
  | { kind: "range"; key: string; label: string; min: number; max: number; step: number }
  | { kind: "toggle"; key: string; label: string; on?: string; off?: string }
  | { kind: "choice"; key: string; label: string; options: readonly ChoiceOption[] }
  | { kind: "action"; key: string; label: string; run: (dials: Dials) => Dials };

/** A hint that points at one control until the visitor uses it. */
interface Nudge {
  key: string;
  text: string;
}

interface SpecimenConfig {
  load(container: HTMLElement, trace: Trace): Promise<SpecimenInstance>;
  initial: Dials;
  controls: Control[];
  nudges?: Nudge[];
  hint: string;
  /** CSS aspect ratio of the stage. */
  aspect?: string;
}

const CAR_STYLES: ChoiceOption[] = [
  { value: "arcade", label: "arcade", patch: { grip: 1.5, drift: 0.15 } },
  { value: "sim", label: "sim", patch: { grip: 1.05, drift: 0.25 } },
  { value: "drift", label: "drift", patch: { grip: 1.1, drift: 0.85 } },
];

const PROJECTILE_KINDS: ChoiceOption[] = [
  { value: "rifle", label: "rifle", patch: { speed: 70, gravity: 2, pellets: 1, rpm: 600, size: 1 } },
  { value: "shotgun", label: "shotgun", patch: { speed: 45, gravity: 4, pellets: 9, rpm: 90, size: 0.8 } },
  { value: "rocket", label: "rocket", patch: { speed: 22, gravity: 1, pellets: 1, rpm: 50, size: 2.6 } },
  { value: "taco", label: "taco", patch: { speed: 16, gravity: 9.8, pellets: 3, rpm: 140, size: 2.2 } },
];

/** A few of the engine's grass look knobs, with ranges and labels read from its own schema. */
const GRASS_KNOBS = ["bladeHeight", "density", "curvature", "season", "dryness", "mixShare", "flowerShare", "windStrength"];
const GRASS_CONTROLS: Control[] = [
  { kind: "choice", key: "preset", label: "preset", options: GRASS_PRESETS.map((p) => ({ value: p.id, label: p.label, patch: { ...p.values } })) },
  ...GRASS_KNOBS.flatMap((key): Control[] => {
    const f = GRASS_SCHEMA.fields.find((field) => field.key === key);
    if (f === undefined || f.type !== "range") return [];
    const label = f.label ?? key;
    return [{ kind: "range", key, label: f.group === "wind" ? `wind ${label}` : label, min: f.min, max: f.max, step: f.step ?? 0.01 }];
  }),
];

const CONFIGS: Record<DemoKey, SpecimenConfig> = {
  catenary: {
    load: async (el) => {
      const s = (await import("../live/specimens/catenary")).createCatenarySpecimen(el);
      return { setDials: (d) => s.setDials({ slack: Number(d.slack) }), dispose: s.dispose };
    },
    initial: { slack: 0.22 },
    controls: [{ kind: "range", key: "slack", label: "slack", min: 0.02, max: 0.6, step: 0.01 }],
    hint: "Drag either pole. catenaryCurve() solves again from the new pole tips.",
  },
  terrain: {
    load: async (el) => {
      const s = (await import("../live/specimens/terrain")).createTerrainSpecimen(el);
      return {
        setDials: (d) =>
          s.setDials({ frequency: Number(d.frequency), octaves: Number(d.octaves), ridged: Boolean(d.ridged), seed: Number(d.seed) }),
        dispose: s.dispose,
      };
    },
    initial: { frequency: 1.1, octaves: 4, ridged: false, seed: 1337 },
    controls: [
      { kind: "range", key: "frequency", label: "frequency", min: 0.5, max: 3, step: 0.1 },
      { kind: "range", key: "octaves", label: "octaves", min: 1, max: 6, step: 1 },
      { kind: "toggle", key: "ridged", label: "ridged" },
      { kind: "action", key: "seed", label: "new seed", run: (d) => ({ ...d, seed: Math.floor(Math.random() * 100000) }) },
    ],
    hint: "fractalNoise(x, z, cfg) moves all 91×91 vertices in place",
  },
  car: {
    load: async (el, trace) => {
      const { createCarSpecimen, isCarStyle } = await import("../live/specimens/car");
      const s = createCarSpecimen(el, trace);
      return {
        setDials: (d) =>
          s.setDials({
            style: isCarStyle(d.style) ? d.style : "drift",
            topSpeed: Number(d.topSpeed),
            accel: Number(d.accel),
            turnRate: Number(d.turnRate),
            grip: Number(d.grip),
            drift: Number(d.drift),
          }),
        dispose: s.dispose,
      };
    },
    initial: { style: "drift", grip: 1.1, drift: 0.85, topSpeed: 34, accel: 10, turnRate: 2.4 },
    controls: [
      { kind: "choice", key: "style", label: "style", options: CAR_STYLES },
      { kind: "range", key: "topSpeed", label: "top speed (m/s)", min: 10, max: 60, step: 1 },
      { kind: "range", key: "accel", label: "acceleration", min: 3, max: 20, step: 0.5 },
      { kind: "range", key: "turnRate", label: "turn rate", min: 1, max: 4, step: 0.1 },
      { kind: "range", key: "grip", label: "grip", min: 0.6, max: 2, step: 0.05 },
      { kind: "range", key: "drift", label: "drift", min: 0, max: 1, step: 0.05 },
    ],
    nudges: [
      { key: "drift", text: "Drag drift down and watch it stop sliding" },
      { key: "style", text: "Switch to arcade" },
      { key: "topSpeed", text: "Give it more top speed" },
    ],
    hint: "The car drives itself. Press W, A, S, D or Space on it to take the wheel.",
  },
  keys: {
    load: async (el, trace) => {
      const s = (await import("../live/specimens/keys")).createKeysSpecimen(el, trace);
      return {
        setDials: (d) => s.setDials({ fireRepeatMs: Number(d.fireRepeatMs), lockFire: Boolean(d.lockFire) }),
        dispose: s.dispose,
      };
    },
    initial: { fireRepeatMs: 120, lockFire: true },
    controls: [
      { kind: "range", key: "fireRepeatMs", label: "fire every (ms)", min: 40, max: 500, step: 10 },
      { kind: "toggle", key: "lockFire", label: "fire on left click is locked", on: "locked", off: "rebindable" },
    ],
    nudges: [{ key: "fireRepeatMs", text: "Slow the fire rate down" }],
    hint: "It plays itself. Change a key in the controls menu and the next press uses it.",
    aspect: "16/9",
  },
  saves: {
    load: async (el, trace) => {
      const s = (await import("../live/specimens/saves")).createSavesSpecimen(el, trace);
      return {
        setDials: (d) => s.setDials({ autosaveSeconds: Number(d.autosaveSeconds), cloud: Boolean(d.cloud) }),
        dispose: s.dispose,
      };
    },
    initial: { autosaveSeconds: 5, cloud: false },
    controls: [
      { kind: "toggle", key: "cloud", label: "save to the cloud", on: "cloud", off: "this browser" },
      { kind: "range", key: "autosaveSeconds", label: "autosave at most every (s)", min: 1, max: 10, step: 0.5 },
    ],
    nudges: [
      { key: "cloud", text: "Flip saves to the cloud" },
      { key: "autosaveSeconds", text: "Save more often" },
    ],
    hint: "The runner plays itself and the engine's save store writes as it goes.",
  },
  projectiles: {
    load: async (el, trace) => {
      const s = (await import("../live/specimens/projectiles")).createProjectilesSpecimen(el, trace);
      return {
        setDials: (d) =>
          s.setDials({
            kind: String(d.kind),
            speed: Number(d.speed),
            gravity: Number(d.gravity),
            pellets: Number(d.pellets),
            rpm: Number(d.rpm),
            size: Number(d.size),
          }),
        dispose: s.dispose,
      };
    },
    initial: { kind: "rifle", speed: 70, gravity: 2, pellets: 1, rpm: 600, size: 1 },
    controls: [
      { kind: "choice", key: "kind", label: "weapon", options: PROJECTILE_KINDS },
      { kind: "range", key: "speed", label: "launch speed (m/s)", min: 5, max: 120, step: 1 },
      { kind: "range", key: "gravity", label: "gravity (m/s²)", min: 0, max: 30, step: 0.5 },
      { kind: "range", key: "pellets", label: "pellets per shot", min: 1, max: 24, step: 1 },
      { kind: "range", key: "rpm", label: "rounds per minute", min: 20, max: 1200, step: 10 },
      { kind: "range", key: "size", label: "size (looks only)", min: 0.5, max: 5, step: 0.1 },
    ],
    nudges: [
      { key: "gravity", text: "Crank the gravity up" },
      { key: "pellets", text: "Fire more pellets per shot" },
      { key: "kind", text: "Try the taco" },
    ],
    hint: "One weapon definition, changed while it fires. The engine flies every pellet.",
  },
  grass: {
    load: async (el, trace) => {
      const s = (await import("../live/specimens/grass")).createGrassSpecimen(el, trace);
      return { setDials: (d) => s.setDials(d), dispose: s.dispose };
    },
    initial: { preset: "meadow", ...GRASS_PRESETS.find((p) => p.id === "meadow")?.values },
    controls: GRASS_CONTROLS,
    nudges: [
      { key: "preset", text: "Pick another preset" },
      { key: "flowerShare", text: "Add more flowers" },
      { key: "season", text: "Drag the season to autumn" },
    ],
    hint: "The engine's own grass renderer, the one every game draws with.",
  },
  minimap: {
    load: async (el, trace) => {
      const s = (await import("../live/specimens/minimap")).createMinimapSpecimen(el, trace);
      return {
        setDials: (d) => s.setDials({ worldRadius: Number(d.worldRadius), units: Number(d.units), rotate: Boolean(d.rotate) }),
        dispose: s.dispose,
      };
    },
    initial: { worldRadius: 60, units: 14, rotate: false },
    controls: [
      { kind: "range", key: "worldRadius", label: "map radius (m)", min: 20, max: 120, step: 5 },
      { kind: "range", key: "units", label: "units in your array", min: 2, max: 40, step: 1 },
      { kind: "toggle", key: "rotate", label: "turn the map with the hero", on: "turns", off: "north up" },
    ],
    nudges: [
      { key: "worldRadius", text: "Zoom the map out" },
      { key: "rotate", text: "Turn the map with the hero" },
    ],
    hint: "The engine's minimap reading the page's own array of units.",
  },
  health: {
    load: async (el, trace) => {
      const s = (await import("../live/specimens/health")).createHealthSpecimen(el, trace);
      return {
        setDials: (d) => s.setDials({ maxHealth: Number(d.maxHealth), hitSize: Number(d.hitSize), potionSize: Number(d.potionSize) }),
        dispose: s.dispose,
      };
    },
    initial: { maxHealth: 100, hitSize: 12, potionSize: 20 },
    controls: [
      { kind: "range", key: "maxHealth", label: "max health", min: 20, max: 300, step: 5 },
      { kind: "range", key: "hitSize", label: "hit size", min: 1, max: 80, step: 1 },
      { kind: "range", key: "potionSize", label: "potion size", min: 5, max: 100, step: 5 },
    ],
    nudges: [{ key: "hitSize", text: "Make the hits bigger" }],
    hint: "Every change goes through the engine's pool and comes back clamped.",
  },
  damage: {
    load: async (el, trace) => {
      const s = (await import("../live/specimens/damage")).createDamageSpecimen(el, trace);
      return { setDials: (d) => s.setDials({ impact: Number(d.impact), armorFactor: Number(d.armorFactor) }), dispose: s.dispose };
    },
    initial: { impact: 24, armorFactor: 0.5 },
    controls: [
      { kind: "range", key: "impact", label: "impact", min: 1, max: 80, step: 1 },
      { kind: "range", key: "armorFactor", label: "armor lets through (×)", min: 0, max: 1.5, step: 0.05 },
    ],
    nudges: [{ key: "armorFactor", text: "Make the armor weaker" }],
    hint: "One resolver call per hit. The matchup table decides what armor does.",
  },
  xp: {
    load: async (el, trace) => {
      const s = (await import("../live/specimens/xp")).createXpSpecimen(el, trace);
      return {
        setDials: (d) =>
          s.setDials({ base: Number(d.base), exponent: Number(d.exponent), maxLevel: Number(d.maxLevel), xpPerKill: Number(d.xpPerKill) }),
        dispose: s.dispose,
      };
    },
    initial: { base: 80, exponent: 1.35, maxLevel: 20, xpPerKill: 60 },
    controls: [
      { kind: "range", key: "xpPerKill", label: "xp per kill", min: 10, max: 600, step: 10 },
      { kind: "range", key: "base", label: "curve base", min: 20, max: 300, step: 5 },
      { kind: "range", key: "exponent", label: "curve steepness", min: 1, max: 2.2, step: 0.05 },
      { kind: "range", key: "maxLevel", label: "max level", min: 5, max: 60, step: 1 },
    ],
    nudges: [
      { key: "xpPerKill", text: "Give more xp per kill" },
      { key: "exponent", text: "Make the curve steeper" },
    ],
    hint: "Surplus xp rolls into the next level; each level reached calls back once.",
  },
};

function decimals(step: number): number {
  if (step >= 1) return 0;
  return step < 0.1 ? 2 : 1;
}

export interface LiveSpecimenProps {
  specimen: DemoKey;
  /** Shared with the code panels so they light what the demo is doing. */
  trace?: Trace;
  /** Called with every settings change, so the code can show the new values. */
  onDials?: (dials: DialSet) => void;
  /** `side` puts the controls beside the stage on wide screens. */
  layout?: "stack" | "side";
}

export function LiveSpecimen({ specimen, trace, onDials, layout = "stack" }: LiveSpecimenProps) {
  const config = CONFIGS[specimen];
  const controlList = config.controls;
  const nudgeList = config.nudges ?? [];
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<SpecimenInstance | null>(null);
  const traceRef = useRef<Trace>(trace ?? createTrace());
  const [dials, setDials] = useState<Dials>(config.initial);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nudgeAt, setNudgeAt] = useState(-1);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let cancelled = false;
    let created: SpecimenInstance | null = null;
    document.documentElement.dataset.jgCapture = "pending";
    config
      .load(host, traceRef.current)
      .then((instance) => {
        if (cancelled) {
          instance.dispose();
          return;
        }
        created = instance;
        instanceRef.current = instance;
        setReady(true);
        // Screenshot tooling (jgengine-verify) waits for this flag.
        document.documentElement.dataset.jgCapture = "ready";
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
        document.documentElement.dataset.jgCapture = "ready";
      });
    return () => {
      cancelled = true;
      created?.dispose();
      instanceRef.current = null;
    };
    // config is a stable module constant keyed by the (fixed) specimen prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specimen]);

  useEffect(() => {
    if (!ready) return;
    instanceRef.current?.setDials(dials);
    onDials?.(dials);
  }, [dials, ready, onDials]);

  useEffect(() => {
    if (!ready || nudgeList.length === 0 || nudgeAt !== -1) return;
    const timer = setTimeout(() => setNudgeAt(0), 2500);
    return () => clearTimeout(timer);
  }, [ready, nudgeList.length, nudgeAt]);

  const nudge = nudgeAt >= 0 ? nudgeList[nudgeAt] : undefined;
  const touched = (key: string) => {
    if (nudge?.key !== key) return;
    // Move on to the next hint once this one has been tried.
    setNudgeAt(-2);
    setTimeout(() => setNudgeAt(nudgeAt + 1 < nudgeList.length ? nudgeAt + 1 : -3), 3500);
  };
  const patch = (key: string, next: Dials) => {
    touched(key);
    setDials((current) => ({ ...current, ...next }));
  };

  const side = layout === "side";
  return (
    <div className={side ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]" : "flex flex-col gap-4"}>
      <div
        data-theme="dark"
        style={{ aspectRatio: config.aspect ?? "16/10" }}
        className="relative overflow-hidden rounded-lg border border-line bg-sunken"
      >
        <div ref={hostRef} className="absolute inset-0" />
        {!ready && !failed && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-fg/[0.05] via-transparent to-accent/[0.04]" />
        )}
        {failed && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <p className="font-mono text-xs text-faint">This demo needs WebGL, which this browser has turned off.</p>
          </div>
        )}
      </div>

      {!failed && (
        <div className="flex flex-col rounded-xl border border-line bg-fg/[0.02] p-4">
          {nudge !== undefined && (
            <p className="mb-3 flex items-center gap-2 rounded-md bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent-text">
              <span className="nudge-arrow" aria-hidden>
                ↓
              </span>
              {nudge.text}
            </p>
          )}
          <div className={`grid gap-x-5 gap-y-3 ${side ? "" : "sm:grid-cols-2"}`}>
            {controlList.map((control) => (
              <div key={control.key} className={nudge?.key === control.key ? "nudge-ring -m-1 p-1" : ""}>
                <ControlView control={control} dials={dials} onPatch={(next) => patch(control.key, next)} />
              </div>
            ))}
          </div>
          <p className="mt-auto flex items-start gap-2 pt-3 font-mono text-[10.5px] leading-relaxed text-faint">
            {ready && <span className="live-dot mt-1 shrink-0" aria-label="live" />}
            <span>{config.hint}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function ControlView({ control, dials, onPatch }: { control: Control; dials: Dials; onPatch: (next: Dials) => void }) {
  if (control.kind === "range") {
    const value = Number(dials[control.key] ?? 0);
    return (
      <label className="block">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{control.label}</span>
          <span className="font-mono text-accent-text">{value.toFixed(decimals(control.step))}</span>
        </div>
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={value}
          onChange={(e) => onPatch({ [control.key]: Number(e.target.value) })}
          className="mt-1 w-full accent-accent"
        />
      </label>
    );
  }
  if (control.kind === "toggle") {
    const on = Boolean(dials[control.key]);
    return (
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{control.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => onPatch({ [control.key]: !on })}
          className={`shrink-0 rounded-full px-3 py-1 font-mono text-[11px] transition ${
            on ? "bg-accent/15 text-accent-text" : "bg-fg/[0.06] text-muted hover:text-fg"
          }`}
        >
          {on ? (control.on ?? "on") : (control.off ?? "off")}
        </button>
      </div>
    );
  }
  if (control.kind === "choice") {
    const current = dials[control.key];
    return (
      <div>
        <p className="text-xs text-muted">{control.label}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {control.options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={current === option.value}
              onClick={() => onPatch({ [control.key]: option.value, ...option.patch })}
              className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${
                current === option.value
                  ? "border-accent/50 bg-accent/15 text-accent-text"
                  : "border-line bg-fg/[0.04] text-muted hover:border-accent/40 hover:text-fg"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPatch(control.run(dials))}
      className="justify-self-start rounded-full border border-line bg-fg/[0.04] px-3 py-1 font-mono text-[11px] text-muted transition hover:border-accent/40 hover:text-accent-text"
    >
      {control.label}
    </button>
  );
}
