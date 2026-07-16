import { INPUT } from "./chromeStyles";

export function NumberField({
  label,
  value,
  onCommit,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type="number"
        step={step}
        className={`w-32 ${INPUT}`}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onCommit(next);
        }}
      />
    </label>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
        <span className="text-cyan-200">{format ? format(value) : value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-amber-400"
      />
    </label>
  );
}
