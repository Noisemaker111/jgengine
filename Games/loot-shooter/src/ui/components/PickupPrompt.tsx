import { useNearestWorldItem } from "@jgengine/react/hooks";
import { itemNameById } from "../../content";

const PICKUP_PROMPT_RADIUS = 3;

export function PickupPrompt() {
  const nearest = useNearestWorldItem(PICKUP_PROMPT_RADIUS);
  if (nearest === null) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 text-center drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-200">Click to pick up</span>
      <span className="text-sm font-bold text-white">
        {itemNameById(nearest.itemId)}
        {nearest.count > 1 ? ` x${nearest.count}` : ""}
      </span>
    </div>
  );
}
