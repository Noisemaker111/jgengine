import { useSyncExternalStore } from "react";

import { run, type RunSnapshot } from "../run";

export function useRun(): RunSnapshot {
  return useSyncExternalStore(run.subscribe, run.getSnapshot, run.getSnapshot);
}
