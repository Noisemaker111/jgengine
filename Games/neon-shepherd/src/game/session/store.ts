import { defineStore } from "@jgengine/core/store/defineStore";
import { PARK_Z } from "../constants";
import type { TierId } from "../difficulty/tiers";
import { CREATURES } from "../entities/creatures/catalog";
import type { CreaturePos } from "../flock/boids";
import { createHoldState, createWhistleState, type HoldState, type WhistleState } from "./gather";
import type { Medal, Phase } from "./runState";

export interface ToastEntry {
  id: string;
  text: string;
  createdAt: number;
}

export interface RunState {
  phase: Phase;
  tier: TierId;
  creatures: Record<string, CreaturePos>;
  strayBase: Record<string, { x: number; z: number }>;
  whistle: WhistleState;
  hold: HoldState;
  playStartedAt: number | null;
  finishedAt: number | null;
  medal: Medal;
  toasts: readonly ToastEntry[];
  lostAtRoadIndex: number | null;
  mapOpen: boolean;
}

export const runStore = defineStore<RunState>("run", () => createInitialRunState());

export function createInitialCreatures(): Record<string, CreaturePos> {
  const out: Record<string, CreaturePos> = {};
  for (const creature of CREATURES) {
    out[creature.id] = { id: creature.id, x: 0, z: PARK_Z, vx: 0, vz: 0, alive: true, straggler: false };
  }
  return out;
}

export function createInitialRunState(tier: TierId = "restless"): RunState {
  return {
    phase: "start",
    tier,
    creatures: createInitialCreatures(),
    strayBase: {},
    whistle: createWhistleState(),
    hold: createHoldState(),
    playStartedAt: null,
    finishedAt: null,
    medal: null,
    toasts: [],
    lostAtRoadIndex: null,
    mapOpen: false,
  };
}

export function aliveCount(run: RunState): number {
  let count = 0;
  for (const creature of Object.values(run.creatures)) if (creature.alive) count += 1;
  return count;
}
