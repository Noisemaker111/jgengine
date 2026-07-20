import { useDebouncedCommit } from "@jgengine/react/useDebouncedCommit";

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
  // Mirror locally + debounce the commit so a held spinner / paste doesn't storm scene regen (#1372).
  const { value: local, onInput, flush } = useDebouncedCommit(value, onCommit);
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type="number"
        step={step}
        className={`w-32 ${INPUT}`}
        value={local}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onInput(next);
        }}
        onBlur={flush}
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
  // The readout + thumb track the live local value; onChange is debounced and flushed on release (#1372).
  const { value: local, onInput, flush } = useDebouncedCommit(value, onChange);
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
        <span className="text-cyan-200">{format ? format(local) : local.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(event) => onInput(Number(event.target.value))}
        onPointerUp={flush}
        onKeyUp={flush}
        onBlur={flush}
        className="w-full accent-amber-400"
      />
    </label>
  );
}
