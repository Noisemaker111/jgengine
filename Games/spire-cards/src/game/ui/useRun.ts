import { useSyncExternalStore } from "react";
import { useGameContext } from "@jgengine/react";

import { runHandle, type RunSnapshot } from "../run";

export function useRun(): RunSnapshot {
  const ctx = useGameContext();
  const run = runHandle.read(ctx);
  return useSyncExternalStore(run.subscribe, run.getSnapshot, run.getSnapshot);
}
