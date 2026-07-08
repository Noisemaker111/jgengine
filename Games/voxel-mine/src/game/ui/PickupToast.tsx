import { useFeed } from "@jgengine/react/hooks";
import { labelForItem } from "../blocks";

interface InventoryAddedPayload {
  userId: string;
  item: string;
  count: number;
}

export function PickupToast() {
  const entries = useFeed({ action: "inventory.added", limit: 3 });
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {entries
        .slice()
        .reverse()
        .map((entry, index) => {
          const data = entry.data as InventoryAddedPayload;
          return (
            <div
              key={`${entry.at}-${index}`}
              className="text-sm font-semibold text-amber-200 drop-shadow"
              style={{ opacity: 1 - index * 0.35 }}
            >
              +{data.count} {labelForItem(data.item)}
            </div>
          );
        })}
    </div>
  );
}
