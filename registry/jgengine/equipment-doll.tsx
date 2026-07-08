import type { ReactNode } from "react";

import type { RarityTierName } from "@/components/ui/item-grid";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

const chamfer = (cut: number) =>
  `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;

const rarityColor = (rarity: RarityTierName | undefined) => `var(--jg-rarity-${rarity ?? "common"})`;

export interface EquipmentSlotSpec {
  id: string;
  label: string;
  icon?: ReactNode;
  rarity?: RarityTierName;
  side: "left" | "right" | "bottom";
}

function SlotLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-[0.24em]"
      style={{
        fontFamily: "var(--jg-font-display)",
        color: "var(--jg-text-dim)",
        textShadow: HUD_TEXT_SHADOW,
      }}
    >
      {children}
    </span>
  );
}

function EquipmentSlotWell({
  slot,
  onSlotClick,
}: {
  slot: EquipmentSlotSpec;
  onSlotClick?: (id: string) => void;
}) {
  const color = slot.icon === undefined ? "var(--jg-edge)" : rarityColor(slot.rarity);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onSlotClick === undefined ? undefined : () => onSlotClick(slot.id)}
        className={`relative p-0 ${onSlotClick === undefined ? "cursor-default" : "cursor-pointer"}`}
        style={{
          width: 46,
          height: 46,
          clipPath: chamfer(6),
          color: "var(--jg-text)",
          border: `1px solid ${color}`,
          background: "linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)",
        }}
      >
        <span className="absolute inset-0 flex items-center justify-center">{slot.icon}</span>
      </button>
      <SlotLabel>{slot.label}</SlotLabel>
    </div>
  );
}

function DefaultFigure() {
  return (
    <svg
      viewBox="0 0 100 200"
      width="100%"
      height="100%"
      fill="var(--jg-text-dim)"
      aria-hidden
      style={{ opacity: 0.25 }}
    >
      <circle cx="50" cy="26" r="15" />
      <path d="M50 44 C36 44 27 52 24 64 L18 96 L26 100 L31 76 L30 118 L26 186 L42 186 L46 128 L54 128 L58 186 L74 186 L70 118 L69 76 L74 100 L82 96 L76 64 C73 52 64 44 50 44 Z" />
    </svg>
  );
}

export function EquipmentDoll({
  slots,
  figure,
  width = 300,
  height = 340,
  onSlotClick,
  className,
}: {
  slots: readonly EquipmentSlotSpec[];
  figure?: ReactNode;
  width?: number;
  height?: number;
  onSlotClick?: (id: string) => void;
  className?: string;
}) {
  const left = slots.filter((slot) => slot.side === "left");
  const right = slots.filter((slot) => slot.side === "right");
  const bottom = slots.filter((slot) => slot.side === "bottom");
  return (
    <div
      className={`flex flex-col gap-2 ${className ?? ""}`}
      data-jg="equipment-doll"
      style={{ width, height }}
    >
      <div className="flex flex-1 items-stretch justify-between gap-2">
        <div className="flex flex-col justify-around gap-2">
          {left.map((slot) => (
            <EquipmentSlotWell key={slot.id} slot={slot} onSlotClick={onSlotClick} />
          ))}
        </div>
        <div className="relative flex-1">{figure ?? <DefaultFigure />}</div>
        <div className="flex flex-col justify-around gap-2">
          {right.map((slot) => (
            <EquipmentSlotWell key={slot.id} slot={slot} onSlotClick={onSlotClick} />
          ))}
        </div>
      </div>
      {bottom.length > 0 && (
        <div className="flex justify-center gap-2">
          {bottom.map((slot) => (
            <EquipmentSlotWell key={slot.id} slot={slot} onSlotClick={onSlotClick} />
          ))}
        </div>
      )}
    </div>
  );
}
