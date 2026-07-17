import type { PathFollowState } from "@jgengine/core/nav/pathFollow";
import { createSpawnDirectorState, type SpawnDirectorState } from "@jgengine/core/ai/spawnDirector";
import { createStats, type Stats } from "@jgengine/core/stats/statModifiers";
import { createWorkQueue, type WorkQueueState } from "@jgengine/core/gameplay";

import type { TowerBuildSpec, TowerReservation } from "./build/construction";
import { BUILD_PLOTS } from "./world/path";
import { SPAWN_DIRECTOR_CONFIG } from "./waves/manifest";

export interface CreepRuntime {
  instanceId: string;
  catalogId: string;
  path: PathFollowState;
  speedStats: Stats<"speed">;
}

export interface TowerRuntime {
  instanceId: string;
  catalogId: string;
  plotId: string;
  cooldownSeconds: number;
}

export interface SessionState {
  director: SpawnDirectorState;
  buildQueue: WorkQueueState<TowerBuildSpec, TowerReservation>;
  creeps: Map<string, CreepRuntime>;
  towers: Map<string, TowerRuntime>;
  plotOccupant: Map<string, string | null>;
  selectedTowerId: string | null;
  gameOver: boolean;
  victory: boolean;
  creepSeq: number;
  towerSeq: number;
}

function freshState(): SessionState {
  const plotOccupant = new Map<string, string | null>();
  for (const plot of BUILD_PLOTS) plotOccupant.set(plot.id, null);
  return {
    director: createSpawnDirectorState(SPAWN_DIRECTOR_CONFIG),
    buildQueue: createWorkQueue<TowerBuildSpec, TowerReservation>(),
    creeps: new Map(),
    towers: new Map(),
    plotOccupant,
    selectedTowerId: null,
    gameOver: false,
    victory: false,
    creepSeq: 0,
    towerSeq: 0,
  };
}

export let session: SessionState = freshState();

export function resetSession(): void {
  session = freshState();
}

export function nextCreepInstanceId(): string {
  session.creepSeq += 1;
  return `creep-${session.creepSeq}`;
}

export function nextTowerInstanceId(): string {
  session.towerSeq += 1;
  return `tower-${session.towerSeq}`;
}

export function newSpeedStats(baseSpeed: number): Stats<"speed"> {
  return createStats<"speed">({ speed: baseSpeed });
}

export function currentWaveNumber(): number {
  return session.director.wave + 1;
}

export function wavesComplete(): boolean {
  return session.director.done;
}

export function activeCreepCount(): number {
  return session.creeps.size;
}
