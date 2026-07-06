import { useInventory } from "@jgengine/react/hooks";
import { AbilitySlotVisual } from "./AbilitySlotVisual";
import { ModalBackdrop } from "./ModalBackdrop";

export function BackpackModal({ onClose }: { onClose: () => void }) {
  const backpack = useInventory("backpack");

  return (
    <ModalBackdrop title="Backpack" keybind="B" onClose={onClose} widthClassName="w-[24rem]">
      <div className="grid grid-cols-7 gap-1.5">
        {backpack.map((slot, index) => (
          <div
            key={index}
            className="relative flex h-12 items-center justify-center overflow-hidden rounded border border-stone-700/80 bg-stone-950/60"
          >
            {slot !== null ? <AbilitySlotVisual itemId={slot.itemId} count={slot.count} /> : null}
          </div>
        ))}
      </div>
    </ModalBackdrop>
  );
}