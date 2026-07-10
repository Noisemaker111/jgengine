import { actionLabel } from "@jgengine/core/input/actionBindings";
import { keybinds } from "../../keybinds";
import { CAPTURE_RADIUS_METERS } from "../../run/captureTension";
import { TOTAL_MAIN_LENGTH } from "../../world/canyon";
import type { RadioLine } from "../../run/radio";

export interface DistanceBarProps {
  readonly gap: number;
  readonly gapDelta: number;
  readonly tensionFraction: number;
}

export function DistanceBar({ gap, gapDelta, tensionFraction }: DistanceBarProps) {
  const closing = gapDelta < -0.02;
  const opening = gapDelta > 0.02;
  const ringCircumference = 2 * Math.PI * 20;
  const inTensionRing = tensionFraction > 0;
  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      <div className="flex items-center gap-3 rounded-full border border-[#ffc857]/40 bg-[#241a2c]/90 px-5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        {inTensionRing ? (
          <svg width={44} height={44} className="shrink-0" viewBox="0 0 44 44">
            <circle cx={22} cy={22} r={20} fill="none" stroke="rgba(232,215,195,0.2)" strokeWidth={3} />
            <circle
              cx={22}
              cy={22}
              r={20}
              fill="none"
              stroke={tensionFraction >= 1 ? "#4ade80" : "#ffc857"}
              strokeWidth={3}
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringCircumference * (1 - tensionFraction)}
              strokeLinecap="round"
              transform="rotate(-90 22 22)"
            />
          </svg>
        ) : null}
        <div className="flex flex-col items-center leading-none">
          <span className="text-[10px] uppercase tracking-[0.3em] text-[#e8d7c3]/60">Gap to Target</span>
          <span className="text-2xl font-bold tabular-nums text-[#e8d7c3]">
            {Math.round(gap)}
            <span className="text-sm text-[#e8d7c3]/60">m</span>
          </span>
        </div>
        <span
          className={
            closing
              ? "text-lg font-bold text-[#4ade80]"
              : opening
                ? "text-lg font-bold text-[#e0546b]"
                : "text-lg font-bold text-[#e8d7c3]/40"
          }
        >
          {closing ? "▼" : opening ? "▲" : "="}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-[0.2em] text-[#e8d7c3]/50">
        Capture: hold inside {CAPTURE_RADIUS_METERS}m for 3s
      </span>
    </div>
  );
}

export interface ConfidenceMeterProps {
  readonly confidence: number;
  readonly surging: boolean;
}

export function ConfidenceMeter({ confidence, surging }: ConfidenceMeterProps) {
  return (
    <div className="pointer-events-none flex w-[min(44vw,11rem)] flex-col gap-1 rounded-xl border border-[#7d8c65]/40 bg-[#241a2c]/85 px-3 py-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-[#e8d7c3]/70">
        <span>Confidence</span>
        {surging ? <span className="text-[#ffc857]">Surge!</span> : null}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#7d8c65] to-[#ffc857] transition-[width]"
          style={{ width: `${Math.round(confidence * 100)}%` }}
        />
      </div>
    </div>
  );
}

export interface BorderCountdownProps {
  readonly truckMainDistance: number;
}

export function BorderCountdown({ truckMainDistance }: BorderCountdownProps) {
  const remaining = Math.max(0, TOTAL_MAIN_LENGTH - truckMainDistance);
  const fraction = Math.max(0, Math.min(1, remaining / TOTAL_MAIN_LENGTH));
  const urgent = remaining < 150;
  return (
    <div className="pointer-events-none flex w-[min(52vw,14rem)] flex-col gap-1 rounded-xl border border-[#9c3820]/50 bg-[#241a2c]/85 px-3 py-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-[#e8d7c3]/70">
        <span>Border Arch</span>
        <span className={urgent ? "text-[#e0546b]" : "text-[#e8d7c3]/70"}>{Math.round(remaining)}m</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full rounded-full transition-[width] ${urgent ? "bg-[#e0546b]" : "bg-[#9c3820]"}`}
          style={{ width: `${Math.round((1 - fraction) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export interface RadioTickerProps {
  readonly lines: readonly RadioLine[];
}

export function RadioTicker({ lines }: RadioTickerProps) {
  const latest = lines.slice(-3).reverse();
  return (
    <div className="pointer-events-none flex w-[min(80vw,18rem)] flex-col gap-1 rounded-xl border border-[#4b3b63]/60 bg-[#1b1220]/90 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.25em] text-[#ffc857]/80">Pursuit Radio</div>
      <div className="flex flex-col gap-1">
        {latest.map((line, index) => (
          <span
            key={line.id}
            className="font-mono text-xs leading-tight text-[#e8d7c3]"
            style={{ opacity: 1 - index * 0.28 }}
          >
            {line.text}
          </span>
        ))}
      </div>
    </div>
  );
}

const CONTROL_ACTIONS = ["throttle", "brake", "steerLeft", "steerRight", "handbrake", "surveyMap"] as const;
const CONTROL_LABELS: Record<(typeof CONTROL_ACTIONS)[number], string> = {
  throttle: "Gas",
  brake: "Brake",
  steerLeft: "Left",
  steerRight: "Right",
  handbrake: "Handbrake",
  surveyMap: "Map",
};

export function KeybindLegend() {
  return (
    <div className="pointer-events-none flex flex-wrap gap-1.5 rounded-xl border border-[#e8d7c3]/20 bg-[#1b1220]/80 px-3 py-2">
      {CONTROL_ACTIONS.map((action) => (
        <span
          key={action}
          className="flex items-center gap-1 rounded-md border border-[#e8d7c3]/25 bg-black/30 px-2 py-1 text-[10px] uppercase tracking-wide text-[#e8d7c3]/80"
        >
          <span className="font-bold text-[#ffc857]">{actionLabel(keybinds, action)}</span>
          {CONTROL_LABELS[action]}
        </span>
      ))}
    </div>
  );
}
