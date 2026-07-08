import { useAbilitySlots } from "@jgengine/react/hooks";
import type { AbilityKit, AbilitySlotSnapshot } from "@jgengine/core/combat/abilityKit";

import { ActionBar, type ActionBarSlot } from "@/components/ui/action-bar";

type SlotState = NonNullable<ActionBarSlot["state"]>;

function snapshotToState(snapshot: AbilitySlotSnapshot): SlotState {
  if (snapshot.charges <= 0) return "cooldown";
  if (!snapshot.ready) return "noResource";
  return "ready";
}

export function AbilityActionBar({
  kit,
  keybinds,
  resourceAvailable,
  onActivate,
  slotSize,
  className,
}: {
  kit: AbilityKit;
  keybinds?: readonly string[];
  resourceAvailable?: (cost: number) => boolean;
  onActivate?: (slotId: string) => void;
  slotSize?: number;
  className?: string;
}) {
  const snapshots = useAbilitySlots(kit, undefined);
  const slots: ActionBarSlot[] = snapshots.map((snapshot, index) => {
    const affordable =
      resourceAvailable === undefined
        ? snapshot.ready || snapshot.charges > 0
        : resourceAvailable(snapshot.resourceCost);
    const state: SlotState =
      snapshot.charges <= 0 ? "cooldown" : !affordable ? "noResource" : snapshotToState(snapshot);
    return {
      id: snapshot.id,
      keybind: keybinds?.[index],
      state,
      cooldownFraction: snapshot.cooldownFraction,
      cooldownSeconds: snapshot.cooldownRemainingMs / 1000,
      charges: snapshot.charges,
      chargesMax: snapshot.chargesMax,
      justCast: snapshot.justCast,
    };
  });
  return <ActionBar slots={slots} onActivate={onActivate} slotSize={slotSize} className={className} />;
}
