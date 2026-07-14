import { defineStore } from "@jgengine/core/store/defineStore";

import type { FloorSurfaceKind, Lane } from "./course";
import type { Medal } from "./medals";
import type { Polarity } from "./polarity";
import type { TrainLineId } from "./trains";

export type SurfaceState =
  | { kind: FloorSurfaceKind }
  | { kind: "train"; line: TrainLineId; boardedOffset: number };

export type RunPhase = "menu" | "running" | "sectorClear" | "won" | "lost";

export interface Toast {
  id: number;
  text: string;
  expiresAt: number;
}

export interface RunState {
  phase: RunPhase;
  sectorIndex: number;
  z: number;
  lane: Lane;
  surface: SurfaceState;
  polarity: Polarity;
  speed: number;
  elapsedSinceRespawn: number;
  totalElapsed: number;
  crashesInSector: number;
  totalCrashes: number;
  lastCause: string | null;
  flipFlashUntil: number;
  toastSeq: number;
  toasts: readonly Toast[];
  loseSectorIndex: number | null;
  loseCause: string | null;
  medal: Medal | null;
  sectorTimes: readonly number[];
}

export function createInitialRunState(): RunState {
  return {
    phase: "menu",
    sectorIndex: 0,
    z: 0,
    lane: 1,
    surface: { kind: "floor" },
    polarity: "red",
    speed: 0,
    elapsedSinceRespawn: 0,
    totalElapsed: 0,
    crashesInSector: 0,
    totalCrashes: 0,
    lastCause: null,
    flipFlashUntil: 0,
    toastSeq: 0,
    toasts: [],
    loseSectorIndex: null,
    loseCause: null,
    medal: null,
    sectorTimes: [],
  };
}

export const runStore = defineStore<RunState>("run", () => createInitialRunState());
