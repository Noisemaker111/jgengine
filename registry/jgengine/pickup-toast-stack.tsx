import type { ReactNode } from "react";

export type PickupRarityTierName = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface PickupEntry {
  id: string;
  icon?: ReactNode;
  label: string;
  count?: number;
  rarity?: PickupRarityTierName;
}

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function rarityColor(rarity: PickupRarityTierName | undefined): string {
  return `var(--jg-rarity-${rarity ?? "common"})`;
}

export function PickupToast({
  entry,
  index = 0,
  className,
}: {
  entry: PickupEntry;
  index?: number;
  className?: string;
}) {
  const color = rarityColor(entry.rarity);
  return (
    <div
      className={className}
      data-jg="pickup-toast"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        color,
        opacity: 1 - index * 0.18,
        animation: "jg-slide-up 0.24s ease-out",
      }}
    >
      {entry.icon ?? (
        <span
          style={{
            width: 8,
            height: 8,
            transform: "rotate(45deg)",
            background: color,
            boxShadow: `0 0 6px ${color}`,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          fontFamily: "var(--jg-font-body)",
          fontSize: 12,
          fontWeight: 600,
          color,
          textShadow: HUD_TEXT_SHADOW,
        }}
      >
        {entry.label}
      </span>
      {entry.count !== undefined && (
        <span
          style={{
            fontFamily: "var(--jg-font-numeric)",
            fontSize: 12,
            color: "var(--jg-text-dim)",
            textShadow: HUD_TEXT_SHADOW,
          }}
        >
          ×{entry.count}
        </span>
      )}
    </div>
  );
}

export function PickupToastStack({
  entries,
  limit = 5,
  className,
}: {
  entries: readonly PickupEntry[];
  limit?: number;
  className?: string;
}) {
  const shown = entries.slice(Math.max(0, entries.length - limit)).reverse();
  return (
    <div
      className={className}
      data-jg="pickup-toast-stack"
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      {shown.map((entry, index) => (
        <PickupToast key={entry.id} entry={entry} index={index} />
      ))}
    </div>
  );
}
