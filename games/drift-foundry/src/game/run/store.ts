import { defineStore } from "@jgengine/core/store/defineStore";

import type { PropRow } from "../world/setup";
import type { DriveInput } from "../vehicle/input";

export interface WorldRuntime {
  propRows: readonly PropRow[];
  cursor: { index: number };
  removedMarkers: Set<string>;
  removedGates: Set<string>;
  /** Set-piece barricades already fallen this run. */
  droppedGates: Set<string>;
  lastRunTime: number;
  /** The track whose run objects are on the yard. */
  trackId: string;
  /** Run clock of the last tumble burst per span, so the oranges and balls roll on a beat instead of every frame. */
  spurts: Map<string, number>;
  /** Shelf grab spots already emptied this run. */
  removedShelves: Set<string>;
  /** Marble spills placed on the floor this run. */
  marbles: Set<string>;
}

export function createWorldRuntime(propRows: readonly PropRow[], trackId: string): WorldRuntime {
  return { propRows, cursor: { index: 0 }, removedMarkers: new Set<string>(), removedGates: new Set<string>(), droppedGates: new Set<string>(), lastRunTime: 0, trackId, spurts: new Map(), removedShelves: new Set<string>(), marbles: new Set<string>() };
}

export const worldRuntimeStore = defineStore<WorldRuntime | undefined>("worldRuntime", undefined);
export const driveInputStore = defineStore<DriveInput | undefined>("driveInput", undefined);
