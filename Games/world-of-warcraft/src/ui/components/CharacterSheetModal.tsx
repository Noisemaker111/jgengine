import { useEntityStat, useInventory, usePlayer } from "@jgengine/react/hooks";
import { itemNameById } from "../../content";
import { AnimatedResourceBar } from "./AnimatedResourceBar";
import { ModalBackdrop } from "./ModalBackdrop";

export function CharacterSheetModal({ onClose }: { onClose: () => void }) {
  const { userId } = usePlayer();
  const level = useEntityStat(userId, "level");
  const xp = useEntityStat(userId, "xp");
  const equipment = useInventory("equipment");

  return (
    <ModalBackdrop title="Character" keybind="C" onClose={onClose} widthClassName="w-[26rem]">
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-xl font-bold text-amber-50">Hero</span>
        <span className="text-sm text-amber-200">Level {level?.current ?? 1}</span>
      </div>
      <div className="mb-4 space-y-1.5">
        <AnimatedResourceBar
          instanceId={userId}
          statId="health"
          mode="health"
          fillClassName="bg-gradient-to-r from-red-700 to-red-500"
          label="Health"
          textClassName="text-red-50"
        />
        <AnimatedResourceBar
          instanceId={userId}
          statId="mana"
          mode="mana"
          fillClassName="bg-gradient-to-r from-blue-800 to-blue-500"
          label="Mana"
          textClassName="text-blue-50"
        />
        <div className="text-xs text-stone-400">
          Experience {xp?.current ?? 0} / {xp?.max ?? 0}
        </div>
      </div>
      <div className="text-xs font-semibold uppercase tracking-wider text-amber-300/80">Equipment</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {equipment.map((slot, index) => (
          <div
            key={index}
            className="flex min-h-12 items-center justify-center rounded border border-stone-700/80 bg-stone-950/50 px-2 text-center text-xs text-stone-200"
          >
            {slot === null ? <span className="text-stone-600">Empty</span> : itemNameById(slot.itemId)}
          </div>
        ))}
      </div>
    </ModalBackdrop>
  );
}