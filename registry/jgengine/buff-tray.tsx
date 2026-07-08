import type { ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

const clampFraction = (value: number) => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)));

export interface BuffChip {
  id: string;
  icon?: ReactNode;
  label?: string;
  stacks?: number;
  remainingFraction?: number;
  kind?: "buff" | "debuff";
}

export function BuffTray({
  buffs,
  size = 30,
  className,
}: {
  buffs: readonly BuffChip[];
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex gap-[3px] ${className ?? ""}`} data-jg="buff-tray">
      {buffs.map((buff) => {
        const kind = buff.kind ?? "buff";
        const edgeColor = kind === "debuff" ? "var(--jg-danger)" : "var(--jg-success)";
        return (
          <div
            key={buff.id}
            title={buff.label}
            className="relative overflow-hidden"
            style={{
              width: size,
              height: size,
              clipPath: chamfer(4),
              color: "var(--jg-text)",
              borderTop: `1px solid ${edgeColor}`,
              borderLeft: "1px solid var(--jg-edge-bright)",
              borderRight: "1px solid var(--jg-edge-bright)",
              borderBottom: "1px solid var(--jg-edge-bright)",
              background: "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center">{buff.icon}</span>
            {buff.remainingFraction !== undefined && (
              <span
                aria-hidden
                className="absolute bottom-0 left-0 h-0.5"
                style={{ width: `${clampFraction(buff.remainingFraction) * 100}%`, background: edgeColor }}
              />
            )}
            {buff.stacks !== undefined && buff.stacks > 1 && (
              <span
                className="absolute bottom-0.5 right-0.5 font-mono text-[9px] font-bold"
                style={{ color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
              >
                {buff.stacks}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
