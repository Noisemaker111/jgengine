import { useEffect, useState } from "react";
import type { EntityFloatTextEvent } from "@jgengine/core/game/events";
import { useGame } from "@jgengine/react/hooks";

import { CombatFloatLayer, type CombatFloatEntry } from "@/components/ui/combat-float-layer";

function defaultMapFloatTextEvent(event: EntityFloatTextEvent): CombatFloatEntry | null {
  const kind: CombatFloatEntry["kind"] =
    event.crit === true
      ? "crit"
      : event.kind === "heal"
        ? "heal"
        : event.kind === "error" || event.kind === "miss"
          ? "error"
          : event.kind === "damage"
            ? "damage"
            : "info";
  const text = event.amount !== undefined ? String(Math.round(event.amount)) : event.text;
  return { id: `${event.instanceId ?? "world"}-${Date.now()}-${Math.random()}`, text, kind };
}

export function GameEventFloats({
  durationMs = 1100,
  className,
  mapEvent,
}: {
  durationMs?: number;
  className?: string;
  mapEvent?: (event: EntityFloatTextEvent) => CombatFloatEntry | null;
}) {
  const { events } = useGame();
  const [entries, setEntries] = useState<readonly CombatFloatEntry[]>([]);
  useEffect(() => {
    const unsubscribe = events.on("entity.floatText", (event) => {
      const entry = (mapEvent ?? defaultMapFloatTextEvent)(event);
      if (entry === null) return;
      setEntries((current) => [...current, entry]);
      setTimeout(() => {
        setEntries((current) => current.filter((item) => item.id !== entry.id));
      }, durationMs + 200);
    });
    return unsubscribe;
  }, [events, mapEvent, durationMs]);
  return <CombatFloatLayer entries={entries} durationMs={durationMs} className={className} />;
}
