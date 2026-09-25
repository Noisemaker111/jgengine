import { useEffect, useRef, useState } from "react";

/**
 * Client-only wrapper for the interactive three.js "live specimens" on the
 * capabilities page. three.js and the specimen modules are pulled in with a
 * dynamic `import()` inside the effect, so nothing three-related ever runs during
 * TanStack Start's SSR pass. Each specimen exposes the same tiny contract —
 * `setDials(dials)` + `dispose()` — driven by real `@jgengine/core` functions.
 */

export type SpecimenKey = "wind" | "catenary" | "terrain";

type Dials = Record<string, number | boolean>;

interface SpecimenInstance {
  setDials(dials: Dials): void;
  dispose(): void;
}

type Control =
  | { kind: "range"; key: string; label: string; min: number; max: number; step: number }
  | { kind: "toggle"; key: string; label: string }
  | { kind: "action"; label: string; run: (dials: Dials) => Dials };

interface SpecimenConfig {
  load(container: HTMLElement): Promise<SpecimenInstance>;
  initial: Dials;
  controls: Control[];
  hint: string;
}

const CONFIGS: Record<SpecimenKey, SpecimenConfig> = {
  wind: {
    load: async (el) => {
      const s = (await import("../live/specimens/windGrass")).createWindSpecimen(el);
      return {
        setDials: (d) => s.setDials({ speed: Number(d.speed), gust: Number(d.gust), turbulence: Number(d.turbulence) }),
        dispose: s.dispose,
      };
    },
    initial: { speed: 2.6, gust: 1.6, turbulence: 0.6 },
    controls: [
      { kind: "range", key: "speed", label: "wind speed", min: 0, max: 6, step: 0.1 },
      { kind: "range", key: "gust", label: "gust", min: 0, max: 4, step: 0.1 },
      { kind: "range", key: "turbulence", label: "turbulence", min: 0, max: 1, step: 0.05 },
    ],
    hint: "windField().atPoint(x, z, t) — sampled on a 12×8 grid, bilinear per blade",
  },
  catenary: {
    load: async (el) => {
      const s = (await import("../live/specimens/catenary")).createCatenarySpecimen(el);
      return { setDials: (d) => s.setDials({ slack: Number(d.slack) }), dispose: s.dispose };
    },
    initial: { slack: 0.22 },
    controls: [{ kind: "range", key: "slack", label: "slack", min: 0.02, max: 0.6, step: 0.01 }],
    hint: "drag either pole — catenaryCurve() re-solves from the live anchors",
  },
  terrain: {
    load: async (el) => {
      const s = (await import("../live/specimens/terrain")).createTerrainSpecimen(el);
      return {
        setDials: (d) =>
          s.setDials({
            frequency: Number(d.frequency),
            octaves: Number(d.octaves),
            ridged: Boolean(d.ridged),
            seed: Number(d.seed),
          }),
        dispose: s.dispose,
      };
    },
    initial: { frequency: 1.1, octaves: 4, ridged: false, seed: 1337 },
    controls: [
      { kind: "range", key: "frequency", label: "frequency", min: 0.5, max: 3, step: 0.1 },
      { kind: "range", key: "octaves", label: "octaves", min: 1, max: 6, step: 1 },
      { kind: "toggle", key: "ridged", label: "ridged" },
      { kind: "action", label: "reseed", run: (d) => ({ ...d, seed: Math.floor(Math.random() * 100000) }) },
    ],
    hint: "fractalNoise(x, z, cfg) — displacing all 91×91 vertices in place",
  },
};

function decimals(step: number): number {
  if (step >= 1) return 0;
  return step < 0.1 ? 2 : 1;
}

export function LiveSpecimen({ specimen }: { specimen: SpecimenKey }) {
  const config = CONFIGS[specimen];
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<SpecimenInstance | null>(null);
  const [dials, setDials] = useState<Dials>(config.initial);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let cancelled = false;
    let created: SpecimenInstance | null = null;
    document.documentElement.dataset.jgCapture = "pending";
    config
      .load(host)
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
        // No WebGL, or a module/render failure: fall back to the "unavailable" note.
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
  }, [dials, ready]);

  const patch = (next: Dials) => setDials((current) => ({ ...current, ...next }));

  return (
    <div className="flex flex-col gap-4">
      <div data-theme="dark" className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-line bg-sunken">
        <div ref={hostRef} className="absolute inset-0" aria-hidden />
        {ready && !failed && (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-bg/75 px-2.5 py-1 font-mono text-[10px] text-fg backdrop-blur-sm">
            <span className="live-dot" aria-hidden />
            live · @jgengine/core
          </span>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-fg/[0.05] via-transparent to-accent/[0.04]" />
        )}
        {failed && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <p className="font-mono text-xs text-faint">
              WebGL unavailable — the code beside this still runs everywhere `@jgengine/core` does.
            </p>
          </div>
        )}
      </div>

      {!failed && (
        <div className="rounded-xl border border-line bg-fg/[0.02] p-4">
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            {config.controls.map((control) => {
              if (control.kind === "range") {
                const value = Number(dials[control.key] ?? 0);
                return (
                  <label key={control.key} className="block">
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
                      onChange={(e) => patch({ [control.key]: Number(e.target.value) })}
                      className="mt-1 w-full accent-accent"
                    />
                  </label>
                );
              }
              if (control.kind === "toggle") {
                const on = Boolean(dials[control.key]);
                return (
                  <div key={control.key} className="flex items-center justify-between text-xs text-muted">
                    <span>{control.label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => patch({ [control.key]: !on })}
                      className={`rounded-full px-3 py-1 font-mono text-[11px] transition ${
                        on ? "bg-accent/15 text-accent-text" : "bg-fg/[0.04] text-muted hover:text-fg"
                      }`}
                    >
                      {on ? "on" : "off"}
                    </button>
                  </div>
                );
              }
              return (
                <div key={control.label} className="flex items-center justify-between text-xs text-muted">
                  <span>{control.label}</span>
                  <button
                    type="button"
                    onClick={() => setDials((current) => control.run(current))}
                    className="rounded-full border border-line bg-fg/[0.04] px-3 py-1 font-mono text-[11px] text-muted transition hover:border-accent/40 hover:text-accent-text"
                  >
                    {control.label} →
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-faint">{config.hint}</p>
        </div>
      )}
    </div>
  );
}
