import { useGameStore } from "@jgengine/react/hooks";
import { createCraterFieldState, type CraterFieldState } from "../craters/craterField";
import { DEFAULT_DIFFICULTY, type DifficultyId } from "./difficulty";
import { createIdleSnapshot, type MatchSnapshot } from "./snapshot";

export function useMatchSnapshot(): MatchSnapshot {
  return useGameStore(
    (ctx) => (ctx.game.store.get("match") as MatchSnapshot | undefined) ?? createIdleSnapshot(DEFAULT_DIFFICULTY),
  );
}

export function useCraterField(): CraterFieldState {
  return useGameStore((ctx) => (ctx.game.store.get("craters") as CraterFieldState | undefined) ?? createCraterFieldState());
}

export function useSelectedDifficulty(): DifficultyId {
  return useGameStore(
    (ctx) => (ctx.game.store.get("selectedDifficulty") as DifficultyId | undefined) ?? DEFAULT_DIFFICULTY,
  );
}
