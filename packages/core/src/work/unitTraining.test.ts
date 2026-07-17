import { describe, expect, test } from "bun:test";

import { cancelJob, createWorkQueue, enqueue, tick, type WorkQueueConfig, type WorkQueueState } from "./jobQueue";
import {
  unitTrainingConfig,
  type UnitReservation,
  type UnitSpawnOrder,
  type UnitTrainingSpec,
} from "./unitTraining";

const config = unitTrainingConfig({
  units: {
    footman: { id: "footman", trainSeconds: 2, cost: { gold: 60 }, population: 1 },
    knight: { id: "knight", trainSeconds: 4, cost: { gold: 120 }, population: 2 },
  },
  refundFraction: 0.5,
});

describe("unit training composition (RTS first-adopter shape)", () => {
  test("reserves cost + population and routes completion to a spawn order", () => {
    let state = createWorkQueue<UnitTrainingSpec, UnitReservation>();
    const queued = enqueue(state, config, { unitId: "footman" });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    state = queued.state;
    expect(queued.job.reservation).toEqual({ cost: { gold: 60 }, population: 1 });

    const spawned: UnitSpawnOrder[] = [];
    const result = tick(state, config, 2);
    for (const event of result.events) if (event.type === "completed") spawned.push(event.output);
    expect(spawned).toEqual([{ unitId: "footman", reservation: { cost: { gold: 60 }, population: 1 } }]);
  });

  test("rejects unknown units", () => {
    const state = createWorkQueue<UnitTrainingSpec, UnitReservation>();
    const rejected = enqueue(state, config, { unitId: "dragon" });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.reason).toBe("unknown-unit");
  });

  test("cancel refunds the configured fraction of cost", () => {
    let state = createWorkQueue<UnitTrainingSpec, UnitReservation>();
    state = enqueue(state, config, { unitId: "knight" }).state;
    const cancelled = cancelJob(state, config, "job-1");
    if (!cancelled.ok) return;
    expect(cancelled.refund).toEqual({ cost: { gold: 60 }, population: 2 });
  });

  test("canEnqueue gate can enforce a population cap", () => {
    const capped: WorkQueueConfig<UnitTrainingSpec, UnitReservation, UnitSpawnOrder> = unitTrainingConfig({
      units: { footman: { id: "footman", trainSeconds: 1, population: 1 } },
      canEnqueue: (_spec, state: WorkQueueState<UnitTrainingSpec, UnitReservation>) =>
        state.jobs.length >= 2 ? { ok: false, reason: "pop-cap" } : { ok: true },
    });
    let state = createWorkQueue<UnitTrainingSpec, UnitReservation>();
    state = enqueue(state, capped, { unitId: "footman" }).state;
    state = enqueue(state, capped, { unitId: "footman" }).state;
    const third = enqueue(state, capped, { unitId: "footman" });
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.reason).toBe("pop-cap");
  });
});

describe("non-RTS use case — download / fabrication queue", () => {
  // A generic "finish X after N seconds" queue over the same primitive: no unit
  // catalog, reservation is a byte budget, output is the finished file id.
  interface DownloadSpec {
    fileId: string;
    seconds: number;
    bytes: number;
  }
  const downloads: WorkQueueConfig<DownloadSpec, { bytes: number }, { fileId: string }> = {
    concurrency: 2,
    duration: (spec) => spec.seconds,
    reserve: (spec) => ({ bytes: spec.bytes }),
    output: (job) => ({ fileId: job.spec.fileId }),
  };

  test("two downloads run in parallel and complete with their file id", () => {
    let state = createWorkQueue<DownloadSpec, { bytes: number }>();
    state = enqueue(state, downloads, { fileId: "a.bin", seconds: 3, bytes: 10 }).state;
    state = enqueue(state, downloads, { fileId: "b.bin", seconds: 3, bytes: 20 }).state;
    const done = tick(state, downloads, 3).events
      .filter((e) => e.type === "completed")
      .map((e) => (e.type === "completed" ? e.output.fileId : ""));
    expect(done.sort()).toEqual(["a.bin", "b.bin"]);
  });
});
