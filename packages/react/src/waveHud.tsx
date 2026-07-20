import { useEffect, useReducer, type CSSProperties, type ReactNode } from "react";

import type { WaveRunner, WaveView } from "@jgengine/core/ai/waveRunner";

import { ExperienceBar } from "./bars";
import { HudFrame, type HudFrameVariation } from "./hudFrame";

/**
 * Subscribe to a {@link WaveRunner} and re-render whenever it notifies (wave,
 * budget, spawns, alert change). Returns the runner's pooled {@link WaveView}. The
 * runner is driven by the game/demo (call `runner.update(dt)`), not by this hook.
 *
 * @capability use-wave-runner React hook that subscribes to a wave runner and returns its pooled current-wave view
 */
export function useWaveRunner(runner: WaveRunner): WaveView {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => runner.subscribe(bump), [runner]);
  return runner.view();
}

/** Reskin tokens for {@link WaveHud}. All optional; each falls back to a sensible default. */
export interface WaveHudTheme {
  /** Accent for the "WAVE N" label glow and the progress fill. Default reads `--jg-accent`. */
  accent?: string;
  /** "WAVE N" label color. Default near-white. */
  label?: string;
  /** Muted color for the small stat captions. */
  muted?: string;
  /** Font family. */
  fontFamily?: string;
  /** "WAVE N" font size (CSS length). Default `"clamp(1.6rem, 4vw, 2.6rem)"`. */
  labelSize?: string;
}

function resolveTheme(theme: WaveHudTheme | undefined): Required<WaveHudTheme> {
  return {
    accent: theme?.accent ?? "var(--jg-accent, #f97316)",
    label: theme?.label ?? "#f8fafc",
    muted: theme?.muted ?? "rgba(226,232,240,0.7)",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    labelSize: theme?.labelSize ?? "clamp(1.6rem, 4vw, 2.6rem)",
  };
}

/** Props for {@link WaveHud}. */
export interface WaveHudProps {
  /** The runner to render. */
  runner: WaveRunner;
  /** Reskin tokens. */
  theme?: WaveHudTheme;
  /** Frame skin passed to {@link HudFrame}. Default `plate`. */
  variation?: HudFrameVariation;
  /** Fixed panel width. Default `260`. */
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

function Stat({ caption, value, muted }: { caption: string; value: string; muted: string }): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: muted }}>{caption}</span>
      <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/**
 * A drop-in wave/spawn HUD panel over a {@link WaveRunner}: a big "WAVE N" label,
 * a wave-progress bar (the shared {@link ExperienceBar}), and the live spawned /
 * total, budget, and alert readouts — the visible face of "the brain behind WAVE 3".
 * It subscribes to the runner and re-renders on change; the game drives the runner's
 * clock. Reskin with {@link WaveHudTheme} and the shared HudTheme bar tokens. When
 * the final wave finishes it shows a "WAVES CLEARED" state. Presentation only: the
 * schedule, budget, and RNG live in the core model, and spawn `kind`s are never read.
 *
 * @capability wave-hud drop-in wave/spawn HUD over a wave runner — big WAVE N label, wave-progress bar, spawned/total + budget + alert readouts, theme-skinnable
 */
export function WaveHud({ runner, theme, variation = "plate", width = 260, className, style }: WaveHudProps): ReactNode {
  const view = useWaveRunner(runner);
  const t = resolveTheme(theme);
  const alertPct = Math.round(view.alert * 100);

  return (
    <HudFrame
      variation={variation}
      width={width}
      title="Spawn Director"
      aside={view.done ? "CLEARED" : `${Math.round(view.waveProgress * 100)}%`}
      className={className}
      style={{ fontFamily: t.fontFamily, color: t.label, ...style }}
    >
      <div data-wave-hud="" data-wave={view.wave} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          data-wave-hud-label=""
          style={{
            fontSize: t.labelSize,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            lineHeight: 1,
            color: t.label,
            textShadow: `0 0 0.4em ${t.accent}, 0 2px 12px rgba(0,0,0,0.6)`,
          }}
        >
          {view.done ? "Waves Cleared" : `Wave ${view.wave}`}
        </div>

        <ExperienceBar
          value={view.waveProgress * 100}
          max={100}
          fill={t.accent}
          label="Wave"
          showValue={false}
          width="100%"
        />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <Stat caption="Spawned" value={`${view.spawnedThisWave}`} muted={t.muted} />
          <Stat caption="Total" value={`${view.spawnedTotal}`} muted={t.muted} />
          <Stat caption="Budget" value={`${Math.round(view.budget)}`} muted={t.muted} />
          <Stat caption="Alert" value={`${alertPct}%`} muted={t.muted} />
        </div>
      </div>
    </HudFrame>
  );
}
