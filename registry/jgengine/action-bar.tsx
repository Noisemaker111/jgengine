import type { ReactNode } from "react";

import { AbilitySlotButton, type AbilitySlotState } from "@/components/ui/ability-slot";

export interface ActionBarSlot {
  id: string;
  icon?: ReactNode;
  keybind?: string;
  state?: AbilitySlotState;
  cooldownFraction?: number;
  cooldownSeconds?: number;
  charges?: number;
  chargesMax?: number;
  justCast?: boolean;
}

export function ActionBar({
  slots,
  onActivate,
  slotSize = 46,
  className,
}: {
  slots: readonly ActionBarSlot[];
  onActivate?: (slotId: string) => void;
  slotSize?: number;
  className?: string;
}) {
  return (
    <div className={`flex gap-[5px] ${className ?? ""}`} data-jg="action-bar">
      {slots.map((slot) => (
        <AbilitySlotButton
          key={slot.id}
          icon={slot.icon}
          keybind={slot.keybind}
          size={slotSize}
          state={slot.state}
          cooldownFraction={slot.cooldownFraction}
          cooldownSeconds={slot.cooldownSeconds}
          charges={slot.charges}
          chargesMax={slot.chargesMax}
          justCast={slot.justCast}
          onActivate={onActivate === undefined ? undefined : () => onActivate(slot.id)}
        />
      ))}
    </div>
  );
}
