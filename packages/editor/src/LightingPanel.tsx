import { useSyncExternalStore } from "react";

import type { EditorEnvironment, EditorSession, EditorSkyPreset } from "@jgengine/core/editor/index";

import { SliderRow } from "./chromeFields";
import { BORDER, CONTROL, CONTROL_ACTIVE, FOCUS_RING, INPUT_CLS, MICRO_LABEL, PANEL_BG } from "./shell/theme";

const PRESETS: readonly { id: EditorSkyPreset; label: string; hint: string }[] = [
  { id: "day", label: "Day", hint: "Clear daylight sky" },
  { id: "dusk", label: "Dusk", hint: "Warm horizon, cooler zenith" },
  { id: "night", label: "Night", hint: "Low sun, dark dome" },
];

/** Engine-aligned defaults shown when the document has no environment bag yet. */
const DISPLAY_DEFAULTS = {
  preset: "day" as EditorSkyPreset,
  timeOfDay: false,
  sunIntensity: 1,
  ambientIntensity: 0.45,
  fogNear: 80,
  fogFar: 400,
  fogColor: "",
  horizonColor: "",
  zenithColor: "",
};

function readDisplay(env: EditorEnvironment | undefined) {
  return {
    preset: env?.preset ?? DISPLAY_DEFAULTS.preset,
    timeOfDay: env?.timeOfDay ?? DISPLAY_DEFAULTS.timeOfDay,
    sunIntensity: env?.sunIntensity ?? DISPLAY_DEFAULTS.sunIntensity,
    ambientIntensity: env?.ambientIntensity ?? DISPLAY_DEFAULTS.ambientIntensity,
    fogNear: env?.fog?.near ?? DISPLAY_DEFAULTS.fogNear,
    fogFar: env?.fog?.far ?? DISPLAY_DEFAULTS.fogFar,
    fogColor: env?.fog?.color ?? DISPLAY_DEFAULTS.fogColor,
    horizonColor: env?.horizonColor ?? DISPLAY_DEFAULTS.horizonColor,
    zenithColor: env?.zenithColor ?? DISPLAY_DEFAULTS.zenithColor,
  };
}

/**
 * Lighting workspace panel — edits `document.environment` (sky preset, time-of-day, intensities,
 * fog, optional horizon/zenith colors) through the session undo stack. No fabricated runtime data:
 * empty document shows defaults as display placeholders; the first edit writes a real bag.
 */
export function LightingPanel({ session }: { session: EditorSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const env = state.document.environment;
  const display = readDisplay(env);
  const authored = env !== undefined;

  const commit = (next: EditorEnvironment | undefined, coalesce?: string) => {
    session.dispatch({ type: "setEnvironment", environment: next }, coalesce === undefined ? undefined : { coalesce });
  };

  const patch = (partial: EditorEnvironment, coalesce?: string) => {
    const base: EditorEnvironment = {
      ...(env ?? {}),
      ...partial,
    };
    // Keep fog merged so scrubbing near/far doesn't drop color.
    if (partial.fog !== undefined || env?.fog !== undefined) {
      base.fog = { ...(env?.fog ?? {}), ...(partial.fog ?? {}) };
      if (Object.keys(base.fog).length === 0) delete base.fog;
    }
    commit(base, coalesce);
  };

  return (
    <div className={`pointer-events-auto absolute left-2.5 top-2 z-30 flex w-72 flex-col gap-2 rounded-[8px] border ${BORDER} ${PANEL_BG} p-2.5 shadow-xl shadow-black/40`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-medium text-neutral-100">Lighting</div>
          <div className="text-[10px] text-neutral-500">
            {authored ? "Scene document environment" : "Defaults shown — first edit authors the bag"}
          </div>
        </div>
        {authored ? (
          <button
            type="button"
            className={`${CONTROL} px-2 py-1 text-[10px]`}
            title="Clear authored environment so world.ts fallbacks apply"
            onClick={() => commit(undefined)}
          >
            Clear
          </button>
        ) : null}
      </div>

      <section className="space-y-1.5">
        <span className={MICRO_LABEL}>Sky preset</span>
        <div className="grid grid-cols-3 gap-1">
          {PRESETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.hint}
              className={`rounded-[5px] px-1.5 py-1 text-[11px] transition-colors ${FOCUS_RING} ${
                display.preset === entry.id && (authored || entry.id === DISPLAY_DEFAULTS.preset)
                  ? CONTROL_ACTIVE
                  : CONTROL
              }`}
              onClick={() => patch({ preset: entry.id }, "env:preset")}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          <input
            type="checkbox"
            className="accent-cyan-400"
            checked={display.timeOfDay}
            onChange={(event) => patch({ timeOfDay: event.target.checked }, "env:tod")}
          />
          Drive from time of day
        </label>
      </section>

      <section className="space-y-1.5 border-t border-white/[0.05] pt-2">
        <span className={MICRO_LABEL}>Sun &amp; ambient</span>
        <SliderRow
          label="sun"
          value={display.sunIntensity}
          min={0}
          max={3}
          step={0.05}
          onChange={(value) => patch({ sunIntensity: value }, "env:sun")}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="ambient"
          value={display.ambientIntensity}
          min={0}
          max={2}
          step={0.05}
          onChange={(value) => patch({ ambientIntensity: value }, "env:ambient")}
          format={(v) => v.toFixed(2)}
        />
      </section>

      <section className="space-y-1.5 border-t border-white/[0.05] pt-2">
        <span className={MICRO_LABEL}>Fog</span>
        <SliderRow
          label="near"
          value={display.fogNear}
          min={0}
          max={500}
          step={1}
          onChange={(value) => patch({ fog: { near: value } }, "env:fogNear")}
          format={(v) => `${Math.round(v)}m`}
        />
        <SliderRow
          label="far"
          value={display.fogFar}
          min={10}
          max={2000}
          step={5}
          onChange={(value) => patch({ fog: { far: value } }, "env:fogFar")}
          format={(v) => `${Math.round(v)}m`}
        />
        <label className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">color</span>
          <input
            type="text"
            className={`w-36 px-2 py-1 ${INPUT_CLS}`}
            placeholder="#a8c4d8"
            value={display.fogColor}
            onChange={(event) => {
              const color = event.target.value.trim();
              const fog = { ...(env?.fog ?? {}) };
              if (color.length === 0) delete fog.color;
              else fog.color = color;
              const next: EditorEnvironment = { ...(env ?? {}) };
              if (Object.keys(fog).length === 0) delete next.fog;
              else next.fog = fog;
              commit(Object.keys(next).length === 0 ? undefined : next, "env:fogColor");
            }}
          />
        </label>
      </section>

      <section className="space-y-1.5 border-t border-white/[0.05] pt-2">
        <span className={MICRO_LABEL}>Sky colors (optional)</span>
        <label className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">horizon</span>
          <input
            type="text"
            className={`w-36 px-2 py-1 ${INPUT_CLS}`}
            placeholder="#87ceeb"
            value={display.horizonColor}
            onChange={(event) => {
              const horizonColor = event.target.value.trim();
              if (horizonColor.length === 0) {
                const next = { ...(env ?? {}) };
                delete next.horizonColor;
                commit(Object.keys(next).length === 0 ? undefined : next, "env:horizon");
              } else {
                patch({ horizonColor }, "env:horizon");
              }
            }}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">zenith</span>
          <input
            type="text"
            className={`w-36 px-2 py-1 ${INPUT_CLS}`}
            placeholder="#1e3a5f"
            value={display.zenithColor}
            onChange={(event) => {
              const zenithColor = event.target.value.trim();
              if (zenithColor.length === 0) {
                const next = { ...(env ?? {}) };
                delete next.zenithColor;
                commit(Object.keys(next).length === 0 ? undefined : next, "env:zenith");
              } else {
                patch({ zenithColor }, "env:zenith");
              }
            }}
          />
        </label>
      </section>
    </div>
  );
}
