import { useInventory } from "@jgengine/react/hooks";
import { labelForItem } from "../blocks";
import { colorFromId } from "../colors";
import { CubeIcon } from "./icons";

/**
 * The pack: a plain grid of slots that start empty and hold whatever you dig up.
 * No pre-listed ore names sitting at zero — an empty slot stays empty until a
 * dropped item lands in it.
 */
export function ResourceTally() {
  const slots = useInventory("resources");

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60 drop-shadow">
        Pack
      </span>
      <div className="grid grid-cols-6 gap-1">
        {slots.map((slot, index) => (
          <div
            key={index}
            title={slot === null ? undefined : labelForItem(slot.itemId)}
            className={`relative flex h-10 w-10 items-center justify-center rounded-md ring-1 ${
              slot === null ? "bg-black/25 ring-white/10" : "bg-black/45 ring-white/25"
            }`}
          >
            {slot !== null ? (
              <>
                <div className="h-6 w-6">
                  <CubeIcon color={colorFromId(slot.itemId)} />
                </div>
                {slot.count > 1 ? (
                  <span className="absolute bottom-0 right-0.5 text-[10px] font-bold tabular-nums text-white drop-shadow">
                    {slot.count}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
