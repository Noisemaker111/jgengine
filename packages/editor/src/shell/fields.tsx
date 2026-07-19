import { useRef, useState, type PointerEvent } from "react";

import { AXIS_COLORS, FOCUS_RING, INPUT_CLS, NUMERIC } from "./theme";

/** Pixels of pointer drag per `step` of value change when scrubbing an axis chip. */
const DRAG_PX_PER_STEP = 4;

function formatValue(value: number, precision: number): string {
  const fixed = value.toFixed(precision);
  // Trim trailing zeros but keep at least one decimal digit ("1.50" -> "1.5", "2.00" -> "2").
  return fixed.replace(/\.?0+$/, "") || "0";
}

/**
 * Polished numeric field with an axis-colored label chip. The whole field is a drag-scrub
 * surface (not just the chip): horizontal pointer-drag adjusts by `step` per few pixels while
 * Alt/Option or double-click focuses the input for precise typing. The input commits finite
 * values on change and re-normalizes its text on blur. Invalid text never commits.
 */
export function AxisNumberField({
  axis,
  label,
  value,
  onCommit,
  step = 0.1,
  precision = 3,
  disabled = false,
  mixed = false,
}: {
  /** Axis coloring; omit for a neutral field. */
  axis?: "x" | "y" | "z";
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  precision?: number;
  disabled?: boolean;
  /** Multi-select mixed values: show an em dash until the user commits a concrete number. */
  mixed?: boolean;
}) {
  // `text` only exists while the input has focus; otherwise the shown value derives from props.
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startValue: number; moved: boolean } | null>(null);

  const formatted = mixed ? "—" : formatValue(value, precision);

  const commitText = (raw: string) => {
    if (raw === "—" || raw.trim().length === 0) return;
    const next = Number(raw);
    if (Number.isFinite(next) && (mixed || next !== value)) onCommit(next);
  };

  const onScrubPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (disabled || editing) return;
    // Alt/Option starts text edit instead of scrubbing.
    if (event.altKey) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // Scrub from the first selected value when mixed — committing absolute values to all.
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value, moved: false };
  };
  const onScrubPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const deltaSteps = Math.round((event.clientX - drag.startX) / DRAG_PX_PER_STEP);
    if (deltaSteps === 0 && !drag.moved) return;
    drag.moved = true;
    const next = drag.startValue + deltaSteps * step;
    const rounded = Number(next.toFixed(precision));
    if (rounded !== value) onCommit(rounded);
  };
  const onScrubPointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    // Click without drag focuses the input for precise typing (whole-field scrub UX).
    if (!drag.moved) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const colors = axis !== undefined ? AXIS_COLORS[axis] : null;

  return (
    <label
      title={`Drag to adjust ${label} · Alt-click or focus input to type`}
      onPointerDown={onScrubPointerDown}
      onPointerMove={onScrubPointerMove}
      onPointerUp={onScrubPointerUp}
      className={`flex min-w-0 flex-1 cursor-ew-resize items-center overflow-hidden rounded-[5px] border border-white/[0.08] bg-black/30 focus-within:border-cyan-400/50 ${
        editing ? "cursor-text" : ""
      }`}
    >
      <span
        className={`relative flex h-6.5 w-6 shrink-0 select-none items-center justify-center border-r border-white/[0.06] bg-white/[0.03] text-[10px] font-semibold uppercase ${
          colors !== null ? colors.text : "text-neutral-500"
        }`}
      >
        {colors !== null ? <span className={`absolute inset-y-0 left-0 w-0.5 ${colors.bar}`} /> : null}
        {label}
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={editing ? text : formatted}
        disabled={disabled}
        aria-label={label}
        onFocus={() => {
          setText(formatted);
          setEditing(true);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setText(event.target.value);
          commitText(event.target.value);
        }}
        onBlur={(event) => {
          setEditing(false);
          commitText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const direction = event.key === "ArrowUp" ? 1 : -1;
            const next = Number((value + direction * step).toFixed(precision));
            onCommit(next);
          }
        }}
        className={`h-6.5 w-full min-w-0 cursor-text bg-transparent px-1.5 text-right text-[11px] text-neutral-200 outline-none ${NUMERIC} disabled:opacity-40`}
      />
    </label>
  );
}

/** Labeled row wrapper aligning a caption with one or more fields. */
export function FieldRow({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="w-16 shrink-0 text-[10px] text-neutral-500">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  );
}

/** Compact text input row used by the inspector header and component cards. */
export function TextField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  return (
    <FieldRow label={label}>
      <input
        className={`h-6.5 w-full min-w-0 px-2 ${INPUT_CLS}`}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onCommit(event.target.value)}
      />
    </FieldRow>
  );
}

/** Small ghost action used inside section headers (reset, link). */
export function SectionAction({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-5 items-center justify-center rounded-[4px] px-1 text-[10px] transition-colors ${FOCUS_RING} ${
        active ? "bg-cyan-500/20 text-cyan-200" : "text-neutral-500 hover:bg-white/[0.08] hover:text-neutral-200"
      } disabled:pointer-events-none disabled:opacity-35`}
    >
      {children}
    </button>
  );
}
