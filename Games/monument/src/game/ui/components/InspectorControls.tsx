import { useRef } from "react";
import type { ReactNode } from "react";

import { EYEBROW } from "../theme";

export type Run = (action: string, input: unknown) => void;

const ACTIVE_BTN = "border border-[#171916] bg-[#171916] text-[#eeeae0]";
const IDLE_BTN = "border border-[rgba(20,22,18,0.22)] text-[#171916] hover:bg-[rgba(20,22,18,0.08)]";

export function LabelRow({ label, hint }: { label: string; hint?: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between px-3.5 pb-1 pt-3">
      <span className={EYEBROW}>{label}</span>
      {hint !== undefined && (
        <span className="text-[9px] uppercase tracking-[0.06em] text-[#8a8d84]">{hint}</span>
      )}
    </div>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  disabledReason,
  contextNote,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabledReason?: string;
  contextNote?: string;
  onChange: (value: number, capture: boolean) => void;
}): ReactNode {
  const pending = useRef(true);
  const disabled = disabledReason !== undefined;
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const note = disabled ? disabledReason : contextNote;
  return (
    <div className={`px-3.5 py-2 ${disabled ? "opacity-45" : ""}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-[#4b4e47]">{label}</span>
        <b className="text-[12px] font-semibold tabular-nums text-[#171916]">
          {display}
          {unit}
        </b>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={() => {
          pending.current = true;
        }}
        onChange={(event) => {
          if (disabled) return;
          onChange(Number(event.target.value), pending.current);
          pending.current = false;
        }}
        className="mt-1.5 h-1 w-full cursor-pointer appearance-none bg-[rgba(20,22,18,0.18)] accent-[#171916] disabled:cursor-not-allowed"
      />
      {note !== undefined && <p className="mt-1 text-[9.5px] leading-snug text-[#8a8d84]">{note}</p>}
    </div>
  );
}

export function OptionStrip<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: readonly T[];
  value: T;
  onSelect: (value: T) => void;
}): ReactNode {
  return (
    <div className="flex flex-wrap gap-1 px-3.5 py-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={`px-2 py-1 text-[10px] font-medium capitalize tracking-[0.02em] transition ${
            value === option ? ACTIVE_BTN : IDLE_BTN
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function CardButton({
  active,
  title,
  subtitle,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle?: string;
  description?: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col gap-0.5 border p-2 text-left leading-tight transition ${
        active
          ? "border-[#171916] bg-[rgba(215,255,67,0.4)]"
          : "border-[rgba(20,22,18,0.18)] hover:bg-[rgba(20,22,18,0.06)]"
      }`}
    >
      {active && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#171916]" />}
      <b className="text-[11px] font-semibold tracking-[-0.01em] text-[#171916]">{title}</b>
      {subtitle !== undefined && <small className="text-[9px] text-[#6d7069]">{subtitle}</small>}
      {description !== undefined && (
        <em className="mt-0.5 text-[9px] not-italic leading-snug text-[#8a8d84]">{description}</em>
      )}
    </button>
  );
}

export function Swatch({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-8 w-8 border-2 transition ${
        active ? "border-[#171916]" : "border-[rgba(20,22,18,0.2)] hover:border-[rgba(20,22,18,0.55)]"
      }`}
      style={{ background: color }}
    />
  );
}

export function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 border border-[rgba(20,22,18,0.14)] bg-[rgba(255,255,255,0.35)] px-2 py-1.5">
      <span className="text-[8.5px] uppercase tracking-[0.08em] text-[#8a8d84]">{label}</span>
      <b className="text-[12px] font-semibold tabular-nums leading-none text-[#171916]">{value}</b>
      {sub !== undefined && <small className="text-[8.5px] text-[#8a8d84]">{sub}</small>}
    </div>
  );
}
