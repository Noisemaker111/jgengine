import type { ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

export interface HotbarItem {
  id: string;
  icon?: ReactNode;
  count?: number;
  label?: string;
}

export function HotbarSelector({
  slots,
  selectedIndex,
  onSelect,
  slotSize = 48,
  className,
}: {
  slots: readonly HotbarItem[];
  selectedIndex: number;
  onSelect?: (index: number) => void;
  slotSize?: number;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 ${className ?? ""}`} data-jg="hotbar-selector">
      {slots.map((slot, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={slot.id}
            type="button"
            title={slot.label}
            onClick={onSelect === undefined ? undefined : () => onSelect(index)}
            className="relative cursor-pointer p-0 transition-transform duration-[120ms] ease-out"
            style={{
              width: slotSize,
              height: slotSize,
              border: `1px solid ${selected ? "var(--jg-accent)" : "var(--jg-edge-bright)"}`,
              clipPath: chamfer(6),
              color: "var(--jg-text)",
              background: "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
              boxShadow: selected
                ? "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 0 10px var(--jg-accent-glow)"
                : "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)",
              transform: selected ? "scale(1.12)" : "none",
            }}
          >
            {selected && (
              <span
                aria-hidden
                className="pointer-events-none absolute -top-[9px] left-1/2 h-0 w-0 -translate-x-1/2"
                style={{
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "6px solid var(--jg-accent)",
                }}
              />
            )}
            <span
              className="absolute left-[3px] top-0.5 font-mono text-[8px]"
              style={{ color: "var(--jg-text-dim)" }}
            >
              {index + 1}
            </span>
            <span className="absolute inset-0 flex items-center justify-center">{slot.icon}</span>
            {slot.count !== undefined && (
              <span
                className="absolute bottom-0.5 right-[3px] font-mono text-[10px] font-bold"
                style={{ color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
              >
                {slot.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
