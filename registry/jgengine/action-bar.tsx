import type { ReactNode } from "react";

import { AbilitySlotButton, type AbilitySlotState } from "@/components/ui/ability-slot";

export interface ActionBarSlot {
  id: string;
  icon?: ReactNode | undefined;
  label?: string | undefined;
  cost?: string | undefined;
  keybind?: string | undefined;
  state?: AbilitySlotState | undefined;
  cooldownFraction?: number | undefined;
  cooldownSeconds?: number | undefined;
  charges?: number | undefined;
  chargesMax?: number | undefined;
  justCast?: boolean | undefined;
}

export function ActionBar({
  slots,
  onActivate,
  slotSize = 46,
  className,
}: {
  slots: readonly ActionBarSlot[];
  onActivate?: ((slotId: string) => void) | undefined;
  slotSize?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={`flex gap-[5px] ${className ?? ""}`} data-jg="action-bar">
      {slots.map((slot) => (
        <AbilitySlotButton
          key={slot.id}
          icon={slot.icon}
          label={slot.label}
          cost={slot.cost}
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
