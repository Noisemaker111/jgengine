// DEPRECATED (#1033): this `tone`-switched umbrella is retired. Prefer the atomic, purpose-named,
// token-themed bars from `@jgengine/react/bars` (HealthBar, ShieldBar, ManaBar, …) — each does one
// readout and restyles globally via the shared `--jg-*` tokens / HudTheme. Kept for reference.
import type { CSSProperties } from "react";

export interface VitalValue {
  current: number;
  max: number;
  min?: number;
}

export type VitalTone = "health" | "mana" | "stamina" | "xp" | "shield";

const TONES: Record<VitalTone, { fill: string; deep: string }> = {
  health: { fill: "var(--jg-health)", deep: "var(--jg-health-deep)" },
  mana: { fill: "var(--jg-mana)", deep: "var(--jg-mana-deep)" },
  stamina: { fill: "var(--jg-stamina)", deep: "var(--jg-stamina-deep)" },
  xp: { fill: "var(--jg-xp)", deep: "var(--jg-xp-deep)" },
  shield: { fill: "var(--jg-shield)", deep: "var(--jg-shield-deep)" },
};

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const slantBar = (lean: number) =>
  `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;

const clampFraction = (value: number) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

function vitalFraction(value: VitalValue): number {
  const min = value.min ?? 0;
  const range = value.max - min;
  if (range <= 0) return 0;
  return clampFraction((value.current - min) / range);
}

export function VitalBar({
  value,
  tone = "health",
  label,
  width = 220,
  height = 16,
  lean = 7,
  segments = 0,
  showNumbers = true,
  className,
  style,
}: {
  value: VitalValue;
  tone?: VitalTone;
  label?: string;
  width?: number | string;
  height?: number;
  lean?: number;
  segments?: number;
  showNumbers?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const colors = TONES[tone];
  const fraction = vitalFraction(value);
  const percent = `${fraction * 100}%`;
  return (
    <div className={className} data-jg="vital-bar" data-tone={tone} style={{ width, ...style }}>
      {(label !== undefined || showNumbers) && (
        <div
          className="mb-0.5 flex items-baseline justify-between"
          style={{ paddingLeft: lean }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
          >
            {label ?? ""}
          </span>
          {showNumbers && (
            <span
              className="font-mono text-[11px] font-bold"
              style={{ color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
            >
              {Math.ceil(value.current)}
              <span style={{ color: "var(--jg-text-dim)" }}> / {value.max}</span>
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={value.min ?? 0}
        aria-valuemax={value.max}
        aria-valuenow={value.current}
        className="relative overflow-hidden"
        style={{
          height,
          clipPath: slantBar(lean),
          background:
            "linear-gradient(180deg, var(--jg-surface-deep) 0%, var(--jg-surface) 100%)",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.8)",
        }}
      >
        <div
          data-ghost
          className="absolute inset-0 opacity-50 transition-[width] duration-700 ease-in-out delay-[280ms]"
          style={{ width: percent, background: "var(--jg-danger)" }}
        />
        <div
          data-fill
          className="absolute inset-0 transition-[width] duration-150 ease-out"
          style={{
            width: percent,
            background: `linear-gradient(180deg, ${colors.fill} 0%, ${colors.deep} 100%)`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              segments > 1
                ? `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / segments}% - 1px), rgba(0,0,0,0.55) calc(${100 / segments}% - 1px), rgba(0,0,0,0.55) ${100 / segments}%)`
                : "none",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 45%)",
          }}
        />
      </div>
    </div>
  );
}
