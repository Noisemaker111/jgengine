import { useCallback, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { Icon, type IconName } from "./icons";
import { CONTROL, CONTROL_ACTIVE, FOCUS_RING, MICRO_LABEL } from "./theme";

/** Icon-only control with a mandatory accessible name (tooltip + aria-label). */
export function IconButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  size = 14,
  className = "",
  tone = "neutral",
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  className?: string;
  tone?: "neutral" | "ghost";
}) {
  const base =
    tone === "ghost"
      ? `rounded-[5px] border border-transparent text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-100 ${FOCUS_RING}`
      : CONTROL;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center ${base} ${active ? CONTROL_ACTIVE : ""} disabled:pointer-events-none disabled:opacity-35 ${className}`}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

/** Thin vertical divider between toolbar clusters. */
export function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.07]" aria-hidden="true" />;
}

/** Keyboard-shortcut chip rendered inside buttons and menus. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[3px] bg-white/[0.07] px-1 py-px font-sans text-[9px] leading-none text-neutral-400 ring-1 ring-inset ring-white/[0.08]">
      {children}
    </kbd>
  );
}

/** One choice within a {@link Segmented} control. */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  /** Keyboard hint shown after the label. */
  kbd?: string;
  /** Hide the text label and render icon-only (label becomes the tooltip). */
  iconOnly?: boolean;
}

/** Compact segmented control on the elevated-control surface with a cyan active segment. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex shrink-0 items-center gap-0.5 rounded-[6px] border border-white/[0.07] bg-black/30 p-0.5 ${disabled ? "pointer-events-none opacity-40" : ""}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.kbd !== undefined ? `${option.label} (${option.kbd})` : option.label}
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-[11px] transition-colors ${FOCUS_RING} ${
              active
                ? "bg-cyan-500/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
                : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
            }`}
          >
            {option.icon !== undefined ? <Icon name={option.icon} size={13} /> : null}
            {option.iconOnly === true ? null : <span>{option.label}</span>}
            {option.kbd !== undefined && option.iconOnly !== true ? (
              <kbd className={`font-sans text-[9px] ${active ? "text-cyan-200/70" : "text-neutral-600"}`}>{option.kbd}</kbd>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal tab strip for dock panels (bottom dock, inspector tabs). */
export function PanelTabs<T extends string>({
  tabs,
  active,
  onSelect,
  trailing,
  ariaLabel,
}: {
  tabs: readonly { id: T; label: string; icon?: IconName; badge?: string | number }[];
  active: T;
  onSelect: (id: T) => void;
  trailing?: ReactNode;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex h-8 shrink-0 items-center gap-0.5 border-b border-white/[0.07] px-1.5">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(tab.id)}
            className={`flex h-6.5 items-center gap-1.5 rounded-[5px] px-2.5 text-[11px] transition-colors ${FOCUS_RING} ${
              selected ? "bg-white/[0.08] text-neutral-100" : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300"
            }`}
          >
            {tab.icon !== undefined ? <Icon name={tab.icon} size={13} /> : null}
            <span>{tab.label}</span>
            {tab.badge !== undefined ? (
              <span className={`rounded-full px-1.5 py-px text-[9px] tabular-nums ${selected ? "bg-cyan-500/20 text-cyan-200" : "bg-white/[0.06] text-neutral-500"}`}>
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
      {trailing !== undefined ? <div className="ml-auto flex items-center gap-1">{trailing}</div> : null}
    </div>
  );
}

/** Collapsible component card for the inspector and side panels. */
export function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  children,
  trailing,
  tone,
}: {
  title: string;
  icon?: IconName;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  trailing?: ReactNode;
  /** Optional accent color for the title icon. */
  tone?: string;
}) {
  return (
    <section className="overflow-hidden rounded-[6px] border border-white/[0.07] bg-white/[0.02]">
      <div className="flex h-7.5 items-center gap-1.5 px-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-[4px] px-1 py-0.5 text-left ${FOCUS_RING}`}
        >
          <Icon name={open ? "chevronDown" : "chevronRight"} size={11} className="shrink-0 text-neutral-500" />
          {icon !== undefined ? (
            <Icon name={icon} size={13} className="shrink-0 text-neutral-400" style={tone !== undefined ? { color: tone } : undefined} />
          ) : null}
          <span className="truncate text-[12px] font-medium text-neutral-200">{title}</span>
        </button>
        {trailing}
      </div>
      {open ? <div className="border-t border-white/[0.05] p-2.5">{children}</div> : null}
    </section>
  );
}

/** Polished empty state used by unsupported workspaces and empty docks. */
export function EmptyState({
  icon,
  title,
  description,
  badge,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-white/[0.07] bg-white/[0.03] text-neutral-500">
        <Icon name={icon} size={18} />
      </div>
      <div className="flex items-center gap-2">
        <div className="text-[12px] font-medium text-neutral-300">{title}</div>
        {badge !== undefined ? (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-500 ring-1 ring-inset ring-white/[0.08]">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="max-w-[32ch] text-[11px] leading-relaxed text-neutral-500">{description}</p>
      {children}
    </div>
  );
}

/** Micro uppercase heading used inside panels. */
export function PanelHeading({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className={MICRO_LABEL}>{children}</div>
      {trailing !== undefined ? <div className="ml-auto flex items-center gap-1">{trailing}</div> : null}
    </div>
  );
}

const RESIZE_KEY_STEP = 16;

/**
 * Drag handle between shell regions. Pointer-drag resizes continuously; arrow keys resize in
 * 16px steps for keyboard access. `sign` maps a positive pointer delta to a size increase.
 */
export function PanelResizer({
  orientation,
  label,
  onResize,
  sign = 1,
}: {
  orientation: "vertical" | "horizontal";
  label: string;
  onResize: (delta: number) => void;
  sign?: 1 | -1;
}) {
  const dragState = useRef<{ pointerId: number; last: number } | null>(null);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      last: orientation === "vertical" ? event.clientX : event.clientY,
    };
  }, [orientation]);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragState.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      const position = orientation === "vertical" ? event.clientX : event.clientY;
      const delta = (position - drag.last) * sign;
      drag.last = position;
      if (delta !== 0) onResize(delta);
    },
    [onResize, orientation, sign],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const grow = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
      const shrink = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
      if (event.key === grow) {
        event.preventDefault();
        onResize(RESIZE_KEY_STEP * sign);
      } else if (event.key === shrink) {
        event.preventDefault();
        onResize(-RESIZE_KEY_STEP * sign);
      }
    },
    [onResize, orientation, sign],
  );

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={`group relative z-10 shrink-0 ${FOCUS_RING} ${
        orientation === "vertical" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
      }`}
    >
      <div
        className={`absolute bg-transparent transition-colors group-hover:bg-cyan-400/40 group-focus-visible:bg-cyan-400/50 ${
          orientation === "vertical" ? "inset-y-0 left-0 w-1" : "inset-x-0 top-0 h-1"
        }`}
      />
    </div>
  );
}
