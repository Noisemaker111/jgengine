import { useInventory } from "@jgengine/react/hooks";
import { ORES } from "../blocks";

export function ResourceTally() {
  const slots = useInventory("resources");
  const countOf = (itemId: string) =>
    slots.reduce((sum, slot) => sum + (slot !== null && slot.itemId === itemId ? slot.count : 0), 0);

  return (
    <div className="flex flex-col items-end gap-0.5">
      {ORES.map((ore) => (
        <div key={ore.id} className="flex items-center gap-1.5 text-xs font-medium text-white drop-shadow">
          <span className="text-white/60">{ore.label}</span>
          <span className="tabular-nums">{countOf(ore.resourceId)}</span>
        </div>
      ))}
    </div>
  );
}
