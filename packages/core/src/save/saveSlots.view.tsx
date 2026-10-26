import { useReducer, useEffect } from "react";

import type { SaveSlotMeta, SaveSlots } from "@jgengine/core/save/saveSlots";


/**
 * Subscribe to a {@link SaveSlots} index and re-render on any change (write,
 * clear, rename, restore). Returns the live list of slots in menu order. Wire it
 * into a save-select screen and mutate the model in event handlers — the menu
 * re-renders itself.
 *
 * @capability use-save-slots React hook binding a save-slots metadata index — re-renders on change and returns the ordered slot list
 */
export function useSaveSlots(model: SaveSlots): SaveSlotMeta[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => model.subscribe(bump), [model]);
  return model.list();
}


/**
 * Turn a `savedAt` timestamp into a compact relative label ("just now", "4m ago",
 * "2d ago"). Presentation-only helper — the model stores raw ms.
 */
export function relativeSavedAt(savedAt: number, nowMs = Date.now()): string {
  const delta = Math.max(0, nowMs - savedAt);
  const s = Math.floor(delta / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
