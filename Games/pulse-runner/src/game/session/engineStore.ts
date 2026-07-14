import { defineStore } from "@jgengine/core/store/defineStore";
import { useStore } from "@jgengine/react/store";

import { createRunnerEngine, type RunnerEngine, type RunnerSnapshot } from "./runnerEngine";

export const engineStore = defineStore<RunnerEngine>("pulse-runner:engine", () => createRunnerEngine());

export function useRunnerSnapshot(): RunnerSnapshot | undefined {
  return useStore(engineStore, (engine) => engine?.snapshot());
}
