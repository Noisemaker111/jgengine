import type { GameContext } from "@jgengine/core/runtime/gameContext";

export type ChronicleKind = "birth" | "death" | "coronation" | "harvest" | "caravan";

export interface ChronicleEntry {
  id: number;
  day: number;
  kind: ChronicleKind;
  message: string;
}

const FEED_ACTION = "chronicle";

let nextId = 0;
let entries: ChronicleEntry[] = [];

export function resetChronicle(): void {
  nextId = 0;
  entries = [];
}

export function record(ctx: GameContext, kind: ChronicleKind, message: string): ChronicleEntry {
  nextId += 1;
  const entry: ChronicleEntry = { id: nextId, day: ctx.time.calendar().day, kind, message };
  entries = [...entries, entry];
  ctx.game.feed.push(FEED_ACTION, entry);
  return entry;
}

export function chronicleEntries(): readonly ChronicleEntry[] {
  return entries;
}
