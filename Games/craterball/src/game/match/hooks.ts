import { useStore } from "@jgengine/react/store";
import type { CraterFieldState } from "../craters/craterField";
import type { DifficultyId } from "./difficulty";
import { craterStore, difficultyStore, matchStore } from "./snapshot";
import type { MatchSnapshot } from "./snapshot";

export function useMatchSnapshot(): MatchSnapshot {
  return useStore(matchStore);
}

export function useCraterField(): CraterFieldState {
  return useStore(craterStore);
}

export function useSelectedDifficulty(): DifficultyId {
  return useStore(difficultyStore);
}
