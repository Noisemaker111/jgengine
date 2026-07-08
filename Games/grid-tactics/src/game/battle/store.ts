import type { ReadableEngineStore } from "@jgengine/react/engineStore";
import type { Tile } from "@jgengine/core/tactics/tacticalGrid";

import type { EnemyIntent } from "../ai";

export type BattlePhase = "player" | "enemy" | "wave-clear" | "victory" | "defeat";

export interface EnemyIntentEntry {
  enemyId: string;
  tile: Tile;
  intent: EnemyIntent;
}

export interface BattleBanner {
  title: string;
  subtitle?: string;
  tone: "neutral" | "victory" | "defeat" | "warning";
}

export interface BattleState {
  phase: BattlePhase;
  waveIndex: number;
  waveLabel: string;
  round: number;
  selectedUnitId: string | null;
  moveTiles: readonly Tile[];
  attackTiles: readonly Tile[];
  actedIds: readonly string[];
  movedIds: readonly string[];
  intents: readonly EnemyIntentEntry[];
  banner: BattleBanner | null;
}

export interface BattleStore extends ReadableEngineStore<BattleState> {
  setState(patch: Partial<BattleState>): void;
  update(mutator: (state: BattleState) => BattleState): void;
}

const initialState: BattleState = {
  phase: "player",
  waveIndex: 0,
  waveLabel: "",
  round: 1,
  selectedUnitId: null,
  moveTiles: [],
  attackTiles: [],
  actedIds: [],
  movedIds: [],
  intents: [],
  banner: null,
};

export function createBattleStore(): BattleStore {
  let state: BattleState = { ...initialState };
  const listeners = new Set<(next: BattleState) => void>();

  function emit(): void {
    for (const listener of listeners) listener(state);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(patch) {
      state = { ...state, ...patch };
      emit();
    },
    update(mutator) {
      state = mutator(state);
      emit();
    },
  };
}
