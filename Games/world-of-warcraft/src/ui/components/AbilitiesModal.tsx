import { actionLabel } from "@jgengine/core/input/actionBindings";
import { abilities } from "../../items/abilities/catalog";
import { itemCooldownById } from "../../content";
import { keybinds } from "../../keybinds";
import { AbilitySlotVisual } from "./AbilitySlotVisual";
import { KeybindBadge } from "./KeybindBadge";
import { ModalBackdrop } from "./ModalBackdrop";

const hotbarKeybinds = abilities.map((_, index) => actionLabel(keybinds, `hotbarSlot${index + 1}`));

export function AbilitiesModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalBackdrop
      title="Abilities"
      keybind={actionLabel(keybinds, "openAbilities") ?? undefined}
      onClose={onClose}
      widthClassName="w-[30rem]"
    >
      <div className="space-y-2">
        {abilities.map((ability, index) => (
          <div
            key={ability.id}
            className="flex items-center gap-3 border-b border-stone-800/60 py-2 last:border-0"
          >
            <KeybindBadge label={hotbarKeybinds[index] ?? "—"} />
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-stone-600">
              <AbilitySlotVisual itemId={ability.id} count={1} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-amber-50">{ability.name}</div>
              <div className="text-xs text-stone-400">
                {Object.entries(ability.weapon)
                  .filter(([key]) => key !== "cooldownSeconds")
                  .map(([key, value]) => `${key} ${value}`)
                  .join(" · ")}
                {itemCooldownById(ability.id) > 0 ? ` · ${itemCooldownById(ability.id)}s cd` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ModalBackdrop>
  );
}