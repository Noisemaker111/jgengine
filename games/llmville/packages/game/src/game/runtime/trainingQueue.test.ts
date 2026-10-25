import { describe, expect, test } from "bun:test";

import {
  TRAINING_TICK_MAX_SECONDS,
  createTrainingQueue,
  enqueueTraining,
  normalizeTrainingState,
  tickTraining,
  trainingEndTime,
  trainingRngUnits,
  trainingTickSeconds,
  trainingTokensRemaining,
  vendorCostForElapsed,
  type TrainingJobSpec,
} from "@llmville/game/game/runtime/trainingQueue";
import {
  TRAINED_MODEL_RNG_UNIT_COUNT,
  computeTrainingDurationMs,
} from "@llmville/game/models/trainingTransition";

function spec(overrides: Partial<TrainingJobSpec> = {}): TrainingJobSpec {
  return {
    startedBy: "user_1",
    baseModelId: "base_1",
    trainingType: "post_train",
    progressKind: "data_drain",
    overtrainBracket: 1,
    workTokens: 1_000,
    drainTokensPerSecond: 100,
    tflopsUsed: 10,
    vendorHourlyUsd: 0,
    reservedDataTokens: 1_000,
    startedAt: 0,
    ...overrides,
  };
}

const RICH = { money: 1_000_000, shopPriceMultiplier: 1 };

describe("training queue", () => {
  test("derives duration from work tokens and the frozen drain rate", () => {
    const started = enqueueTraining(createTrainingQueue(), spec());
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.job.duration).toBe(10);
  });

  test("honors the post-train minimum duration floor", () => {
    const started = enqueueTraining(createTrainingQueue(), spec({ workTokens: 1, drainTokensPerSecond: 1_000_000 }));
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.job.duration).toBe(5);
  });

  test("runs one job at a time", () => {
    const first = enqueueTraining(createTrainingQueue(), spec());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = enqueueTraining(first.state, spec({ baseModelId: "base_2" }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const ticked = tickTraining({ state: second.state, dtSeconds: 1, ...RICH });
    expect(ticked.state.jobs.filter((job) => job.status === "active")).toHaveLength(1);
  });

  test("drains remaining tokens toward zero and completes", () => {
    const started = enqueueTraining(createTrainingQueue(), spec());
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    let state = started.state;
    let ticked = tickTraining({ state, dtSeconds: 4, ...RICH });
    state = ticked.state;
    const midway = state.jobs.find((job) => job.id === started.job.id);
    expect(midway).toBeDefined();
    if (midway === undefined) return;
    expect(trainingTokensRemaining(midway)).toBe(600);
    expect(ticked.completed).toHaveLength(0);

    ticked = tickTraining({ state, dtSeconds: 6, ...RICH });
    expect(ticked.completed).toHaveLength(1);
    expect(ticked.completed[0]?.spec.baseModelId).toBe("base_1");
  });

  test("charges the vendor only for distill jobs, proportional to elapsed time", () => {
    expect(vendorCostForElapsed(spec({ vendorHourlyUsd: 0 }), 3_600, 1)).toBe(0);
    expect(vendorCostForElapsed(spec({ vendorHourlyUsd: 36 }), 3_600, 1)).toBe(36);
    expect(vendorCostForElapsed(spec({ vendorHourlyUsd: 36 }), 3_600, 2)).toBe(72);
  });

  test("stalls a distill job the player cannot pay for, and does not advance it", () => {
    const started = enqueueTraining(
      createTrainingQueue(),
      spec({ progressKind: "distill_pool", vendorHourlyUsd: 3_600, reservedDataTokens: 0 }),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const ticked = tickTraining({ state: started.state, dtSeconds: 1, money: 0, shopPriceMultiplier: 1 });
    expect(ticked.stalled).toHaveLength(1);
    expect(ticked.moneySpent).toBe(0);
    const stalledJob = ticked.state.jobs.find((job) => job.id === started.job.id);
    expect(stalledJob?.status).toBe("paused");
    expect(stalledJob?.elapsed).toBe(0);
  });

  test("resumes a stalled job once the player can pay again", () => {
    const started = enqueueTraining(
      createTrainingQueue(),
      spec({ progressKind: "distill_pool", vendorHourlyUsd: 3_600, reservedDataTokens: 0 }),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const stalled = tickTraining({ state: started.state, dtSeconds: 1, money: 0, shopPriceMultiplier: 1 });
    const recovered = tickTraining({ state: stalled.state, dtSeconds: 1, money: 10_000, shopPriceMultiplier: 1 });
    expect(recovered.stalled).toHaveLength(0);
    expect(recovered.moneySpent).toBe(1);
    const job = recovered.state.jobs.find((entry) => entry.id === started.job.id);
    expect(job?.status).toBe("active");
    expect(job?.elapsed).toBeGreaterThan(0);
  });

  test("reports an end time that shrinks as the job advances", () => {
    const started = enqueueTraining(createTrainingQueue(), spec());
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(trainingEndTime(started.job, 1_000)).toBe(11_000);

    const ticked = tickTraining({ state: started.state, dtSeconds: 4, ...RICH });
    const job = ticked.state.jobs.find((entry) => entry.id === started.job.id);
    expect(job).toBeDefined();
    if (job === undefined) return;
    expect(trainingEndTime(job, 1_000)).toBe(7_000);
  });

  test("enqueues durations in seconds while the training domain speaks milliseconds", () => {
    const workTokens = 60_000;
    const drainTokensPerSecond = 1_000;
    expect(computeTrainingDurationMs(workTokens, drainTokensPerSecond)).toBe(60_000);

    const started = enqueueTraining(createTrainingQueue(), spec({ workTokens, drainTokensPerSecond }));
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.job.duration).toBe(60);

    const short = tickTraining({ state: started.state, dtSeconds: 59, ...RICH });
    expect(short.completed).toHaveLength(0);
    const finished = tickTraining({ state: short.state, dtSeconds: 1, ...RICH });
    expect(finished.completed).toHaveLength(1);
  });

  test("converts a wall-clock millisecond gap into capped tick seconds", () => {
    expect(trainingTickSeconds(1_000, 6_000)).toBe(5);
    expect(trainingTickSeconds(1_000, 1_500)).toBe(0.5);
    expect(trainingTickSeconds(6_000, 1_000)).toBe(0);
    expect(trainingTickSeconds(0, 10 * 60 * 1_000)).toBe(TRAINING_TICK_MAX_SECONDS);
  });

  test("normalizes missing or malformed stored training state", () => {
    expect(normalizeTrainingState(undefined, 42)).toEqual({ queue: createTrainingQueue(), lastTickAtMs: 42 });
    expect(normalizeTrainingState({ queue: { jobs: [] } }, 42).lastTickAtMs).toBe(42);

    const started = enqueueTraining(createTrainingQueue(), spec());
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const stored = { queue: started.state, lastTickAtMs: 7 };
    expect(normalizeTrainingState(stored, 42)).toBe(stored);
  });

  test("rolls the same units for a seed so completion replays identically", () => {
    const units = trainingRngUnits("job_1:user_1:0");
    expect(units).toHaveLength(TRAINED_MODEL_RNG_UNIT_COUNT);
    expect(units).toEqual(trainingRngUnits("job_1:user_1:0"));
    expect(units).not.toEqual(trainingRngUnits("job_2:user_1:0"));
    for (const unit of units) {
      expect(unit).toBeGreaterThanOrEqual(0);
      expect(unit).toBeLessThan(1);
    }
  });
});
