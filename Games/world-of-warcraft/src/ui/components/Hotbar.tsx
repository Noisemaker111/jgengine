import type { AbilitySlotSnapshot } from "@jgengine/core/combat/abilityKit";
import { SlotGrid } from "@jgengine/react/components";
import { useAbilitySlots, useEntityStat, usePlayer } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { abilityKitFor } from "../../combat/playerKits";
import { itemNameById } from "../../content";
import { useSelectedHotbarSlot } from "../hooks/useUiState";
import { wowActionSlot, wowKeybind } from "../wowStyles";
import { AbilitySlotVisual } from "./AbilitySlotVisual";
import { KeybindBadge } from "./KeybindBadge";

export function Hotbar({ onStatus }: { onStatus?: (message: string) => void }) {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const mana = useEntityStat(userId, "mana");
  const selectedSlot = useSelectedHotbarSlot();
  const slotStates = useAbilitySlots(abilityKitFor(userId), mana?.current ?? 0);
  const byId = new Map<string, AbilitySlotSnapshot>();
  for (const snapshot of slotStates) byId.set(snapshot.id, snapshot);

  function useSlot(slotIndex: number): void {
    const slot = ctx.player.inventory.state("hotbar").slots[slotIndex];
    if (slot === undefined || slot === null) {
      onStatus?.(`Hotbar slot ${slotIndex + 1} is empty`);
      return;
    }
    const result = ctx.item.use.use({
      from: userId,
      itemId: slot.itemId,
      inventoryId: "hotbar",
      aim: { yaw: ctx.scene.entity.get(userId)?.rotationY ?? 0, pitch: 0 },
    });
    if (result.error !== undefined) onStatus?.(result.error);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone-400">
        <span>Action Bar</span>
        <KeybindBadge label="Shift+Scroll" />
      </div>
      <SlotGrid
        inventoryId="hotbar"
        className="flex gap-1"
        renderSlot={(slot, index) => {
          const keyLabel = String(index + 1);
          if (slot === null) {
            return (
              <button
                type="button"
                title={`Empty hotbar slot ${index + 1}`}
                className={[wowActionSlot, "opacity-40", index === selectedSlot ? "ring-1 ring-amber-400/50" : ""].join(" ")}
                disabled
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span className={wowKeybind}>{keyLabel}</span>
                <span className="text-xl font-light text-stone-600">+</span>
              </button>
            );
          }

          const state = byId.get(slot.itemId);
          const outOfMana = state?.state === "no-resource";
          const onCooldown = state?.state === "cooldown";
          const flashing = state?.state === "just-cast";
          const cooldownPercent = onCooldown && state ? state.cooldownFraction * 100 : 0;
          const remainingSeconds = state ? state.cooldownRemainingMs / 1000 : 0;
          const selected = index === selectedSlot;

          return (
            <button
              type="button"
              title={`${itemNameById(slot.itemId)} (${keyLabel})`}
              className={[
                wowActionSlot,
                outOfMana ? "ring-2 ring-red-500/80 brightness-75 saturate-50" : "",
                onCooldown ? "brightness-75" : "",
                flashing ? "ring-2 ring-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.6)]" : "",
                selected ? "ring-2 ring-amber-300/70" : "",
              ].join(" ")}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                useSlot(index);
              }}
            >
              <span className={wowKeybind}>{keyLabel}</span>
              <AbilitySlotVisual itemId={slot.itemId} count={slot.count} />
              {onCooldown ? (
                <>
                  <div
                    className="pointer-events-none absolute inset-0 z-[3] rounded-md bg-black/55"
                    style={{
                      clipPath: `inset(${100 - cooldownPercent}% 0 0 0)`,
                    }}
                  />
                  <span className="absolute inset-0 z-[4] flex items-center justify-center text-sm font-bold text-amber-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                    {remainingSeconds >= 10 ? Math.ceil(remainingSeconds) : remainingSeconds.toFixed(1)}
                  </span>
                </>
              ) : null}
              {outOfMana ? (
                <span className="absolute bottom-0.5 left-1 z-[4] text-[9px] font-bold uppercase tracking-wide text-red-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                  No mana
                </span>
              ) : null}
            </button>
          );
        }}
      />
    </div>
  );
}
