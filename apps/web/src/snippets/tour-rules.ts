import { pickWeighted } from "@jgengine/core/random/pick";
import { changeMeter, createMeter, tickMeter, type MeterState } from "@jgengine/core/stats/statPool";
import { tierAt, type ThresholdBoundary } from "@jgengine/core/threshold/thresholds";

// Rules are plain functions over plain JSON, built from the engine's parts:
// a meter, a ladder, a weighted table. No engine object and no renderer, so the
// same code runs in the browser, on a Node host and in `bun test`.

export interface Run {
  energy: MeterState;
  gathered: number;
  finds: string[];
}

const RANKS: readonly ThresholdBoundary<string>[] = [
  { id: "Wanderer", at: 0 },
  { id: "Forager", at: 2 },
  { id: "Pathfinder", at: 5 },
];
const FINDS = [
  { id: "timber", weight: 5 },
  { id: "amber", weight: 1 },
] as const;

export const newRun = (): Run => ({
  energy: createMeter({ max: 100, current: 60 }),
  gathered: 0,
  finds: [],
});

export function gather(run: Run, rng: () => number): Run {
  const find = pickWeighted(rng, FINDS, (entry) => entry.weight) ?? FINDS[0];
  return {
    energy: changeMeter(run.energy, 20).meter,
    gathered: run.gathered + 1,
    finds: [...run.finds, find.id],
  };
}

export const drain = (run: Run, dt: number): Run => ({
  ...run,
  energy: tickMeter(run.energy, { decay: 0.4 }, dt).meter,
});

export const rankOf = (run: Run): string => tierAt(RANKS, run.gathered)?.id ?? "Wanderer";
