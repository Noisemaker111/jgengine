import { defineStore } from "@jgengine/core/store/defineStore";

import type { PropRow } from "../world/setup";
import type { DriveInput } from "../vehicle/input";

export interface WorldRuntime {
  propRows: readonly PropRow[];
  cursor: { index: number };
  removedMarkers: Set<string>;
}

export function createWorldRuntime(propRows: readonly PropRow[]): WorldRuntime {
  return { propRows, cursor: { index: 0 }, removedMarkers: new Set<string>() };
}

export const worldRuntimeStore = defineStore<WorldRuntime | undefined>("worldRuntime", undefined);
export const driveInputStore = defineStore<DriveInput | undefined>("driveInput", undefined);
