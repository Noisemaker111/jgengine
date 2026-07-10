import type { PropRow } from "../world/setup";

export const WORLD_STORE_KEY = "worldRuntime";
export const INPUT_STORE_KEY = "driveInput";

export interface WorldRuntime {
  propRows: readonly PropRow[];
  cursor: { index: number };
  removedMarkers: Set<string>;
}

export function createWorldRuntime(propRows: readonly PropRow[]): WorldRuntime {
  return { propRows, cursor: { index: 0 }, removedMarkers: new Set<string>() };
}
