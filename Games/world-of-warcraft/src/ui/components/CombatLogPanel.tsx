import type {
  EntityDiedEvent,
  LootGrantedEvent,
  QuestUpdatedEvent,
} from "@jgengine/core/game/events";
import { useFeed } from "@jgengine/react/hooks";
import { ChevronDown, ChevronUp, Coins, ScrollText, Skull, Swords } from "lucide-react";
import { useMemo, useState } from "react";
import { entityNameById, itemNameById } from "../../content";
import { questById } from "../../quests/catalog";
import { wowPanel, wowPanelHeader } from "../wowStyles";

type LogFilter = "all" | "combat" | "quest" | "loot";

interface LogEntry {
  at: number;
  filter: Exclude<LogFilter, "all">;
  text: string;
  tone: string;
  icon: typeof Skull;
}

function dropLabel(drop: LootGrantedEvent["drops"][number]): string {
  return drop.item !== undefined ? `${drop.count}x ${itemNameById(drop.item)}` : `${drop.count} ${drop.currency}`;
}

function formatTime(at: number): string {
  const date = new Date(at);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const filterOptions: { id: LogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "combat", label: "Combat" },
  { id: "quest", label: "Quest" },
  { id: "loot", label: "Loot" },
];

export function CombatLogPanel() {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [expanded, setExpanded] = useState(true);
  const kills = useFeed({ action: "entity.died", limit: 12 });
  const questUpdates = useFeed({ action: "quest.updated", limit: 12 });
  const loot = useFeed({ action: "loot.granted", limit: 12 });

  const entries = useMemo(() => {
    const lines: LogEntry[] = [
      ...kills.map((entry) => ({
        at: entry.at,
        filter: "combat" as const,
        text: `${entityNameById((entry.data as EntityDiedEvent).catalogId)} slain`,
        tone: "text-red-200",
        icon: Skull,
      })),
      ...questUpdates.map((entry) => {
        const data = entry.data as QuestUpdatedEvent;
        return {
          at: entry.at,
          filter: "quest" as const,
          text: `${questById(data.questId)?.title ?? data.questId} — objective ${data.progress ?? 0}`,
          tone: "text-amber-100",
          icon: ScrollText,
        };
      }),
      ...loot.map((entry) => ({
        at: entry.at,
        filter: "loot" as const,
        text: `Received ${(entry.data as LootGrantedEvent).drops.map(dropLabel).join(", ")}`,
        tone: "text-emerald-200",
        icon: Coins,
      })),
    ];
    return lines.sort((a, b) => b.at - a.at).slice(0, 24);
  }, [kills, questUpdates, loot]);

  const visible = filter === "all" ? entries : entries.filter((entry) => entry.filter === filter);

  return (
    <div className={[wowPanel, "flex w-80 flex-col"].join(" ")}>
      <header className="flex items-center justify-between gap-2 border-b border-amber-800/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-amber-300" />
          <span className={wowPanelHeader}>Combat Log</span>
        </div>
        <button
          type="button"
          title={expanded ? "Collapse combat log" : "Expand combat log"}
          aria-label={expanded ? "Collapse combat log" : "Expand combat log"}
          className="pointer-events-auto rounded border border-stone-700 bg-stone-900/80 p-1 text-stone-300 transition hover:border-amber-400 hover:text-amber-100"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </header>
      <div className="flex flex-wrap gap-1 border-b border-amber-800/30 px-3 py-2">
        {filterOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={[
              "pointer-events-auto rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition",
              filter === option.id
                ? "bg-amber-600/35 text-amber-100"
                : "bg-stone-900/70 text-stone-400 hover:text-amber-100",
            ].join(" ")}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {expanded ? (
        <div className="max-h-52 overflow-y-auto px-3 py-2 scrollbar-thin">
          {visible.length === 0 ? (
            <div className="py-6 text-center text-sm text-stone-500">No events recorded yet.</div>
          ) : (
            <div className="space-y-1.5">
              {visible.map((entry, index) => {
                const Icon = entry.icon;
                return (
                  <div
                    key={`${entry.at}-${entry.filter}-${index}`}
                    className="flex items-start gap-2 rounded-md border border-stone-800/80 bg-stone-950/50 px-2 py-1.5"
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-500" />
                    <div className="min-w-0 flex-1">
                      <div className={["text-sm leading-snug", entry.tone].join(" ")}>{entry.text}</div>
                      <div className="text-[10px] text-stone-500">{formatTime(entry.at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-stone-500">
          {visible.length === 0 ? "Waiting for combat events…" : `${visible.length} recent event${visible.length === 1 ? "" : "s"}`}
        </div>
      )}
    </div>
  );
}