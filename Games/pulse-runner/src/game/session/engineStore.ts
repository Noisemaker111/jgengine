import { defineStore } from "@jgengine/core/store/defineStore";
import { useStore } from "@jgengine/react/store";

import type { RunnerEngine, RunnerSnapshot } from "./runnerEngine";

export const engineStore = defineStore<RunnerEngine | undefined>("pulse-runner:engine", undefined);

export function useRunnerSnapshot(): RunnerSnapshot | undefined {
  return useStore(engineStore, (engine) => engine?.snapshot());
}
