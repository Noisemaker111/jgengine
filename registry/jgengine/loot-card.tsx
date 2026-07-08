import type { ReactNode } from "react";

import type { RarityTierName } from "@/components/ui/item-grid";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

const rarityColor = (rarity: RarityTierName | undefined) => `var(--jg-rarity-${rarity ?? "common"})`;

export function LootCard({
  name,
  rarity,
  typeLine,
  icon,
  stats,
  affixes,
  flavor,
  width = 240,
  className,
}: {
  name: string;
  rarity?: RarityTierName;
  typeLine?: string;
  icon?: ReactNode;
  stats?: readonly string[];
  affixes?: readonly string[];
  flavor?: string;
  width?: number;
  className?: string;
}) {
  const color = rarityColor(rarity);
  return (
    <div
      className={`flex flex-col gap-1.5 p-2.5 ${className ?? ""}`}
      data-jg="loot-card"
      style={{
        width,
        clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
        background:
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.016) 0px, rgba(255,255,255,0.016) 1px, transparent 1px, transparent 7px), linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
        border: `1px solid ${color}`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 36,
            height: 36,
            clipPath: chamfer(5),
            color: "var(--jg-text)",
            border: `1px solid ${color}`,
            background: "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
          }}
        >
          {icon}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold"
            style={{ fontFamily: "var(--jg-font-display)", color, textShadow: HUD_TEXT_SHADOW }}
          >
            {name}
          </span>
          {typeLine !== undefined && (
            <span className="text-[10px]" style={{ color: "var(--jg-text-dim)" }}>
              {typeLine}
            </span>
          )}
        </div>
      </div>
      <span
        className="block h-px"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${color} 18%, ${color} 82%, transparent 100%)` }}
      />
      {stats !== undefined && stats.length > 0 && (
        <div className="flex flex-col gap-px">
          {stats.map((line, index) => (
            <span key={index} className="text-[11px]" style={{ color: "var(--jg-text)" }}>
              {line}
            </span>
          ))}
        </div>
      )}
      {affixes !== undefined && affixes.length > 0 && (
        <div className="flex flex-col gap-px">
          {affixes.map((line, index) => (
            <span key={index} className="text-[11px] italic" style={{ color }}>
              {line}
            </span>
          ))}
        </div>
      )}
      {flavor !== undefined && (
        <span className="text-[10px] italic" style={{ color: "var(--jg-text-dim)" }}>
          {flavor}
        </span>
      )}
    </div>
  );
}
