import { useFeed } from "@jgengine/react/hooks";
import { enemyById } from "../../entities/enemies/catalog";

interface DiedEntryData {
  catalogId?: string;
}

export function KillFeed() {
  const entries = useFeed({ action: "entity.died", limit: 5 });
  return (
    <div className="flex flex-col items-end gap-1">
      {entries.map((entry, index) => {
        const data = entry.data as DiedEntryData;
        const enemy = data.catalogId === undefined ? undefined : enemyById(data.catalogId);
        if (enemy === undefined) return null;
        return (
          <div
            key={index}
            className="rounded-sm bg-black/55 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-slate-300"
            style={{ opacity: 1 - index * 0.15 }}
          >
            <span className="text-rose-400">☠</span> {enemy.name}
            <span className="ml-1.5 text-amber-300">+{enemy.score}</span>
          </div>
        );
      })}
    </div>
  );
}
