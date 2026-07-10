import { describe, expect, test } from "bun:test";
import { MAX_DROWNS } from "../tide/catalog";
import { DELIVERY_JOBS, REQUIRED_DELIVERIES, jobById, jobQueueForSeed } from "../delivery/catalog";
import { HOME_VILLAGE_ID } from "../world/villages";
import {
  activeJobId,
  advanceElapsed,
  applyDrown,
  createInitialRun,
  deliverPackage,
  isFrozen,
  pickupPackage,
  restartRun,
  startRun,
  touchVillage,
} from "./runState";

const SEED = "test-seed";

function playing(seed = SEED) {
  return startRun(createInitialRun(seed));
}

describe("seeded island determinism", () => {
  test("the same seed always produces the same delivery queue order", () => {
    expect(jobQueueForSeed(SEED)).toEqual(jobQueueForSeed(SEED));
    const a = createInitialRun(SEED);
    const b = createInitialRun(SEED);
    expect(a.queue).toEqual(b.queue);
  });

  test("different seeds can diverge", () => {
    const a = jobQueueForSeed("seed-a");
    const b = jobQueueForSeed("seed-b");
    expect(a).not.toEqual(b);
  });

  test("the queue contains every catalog job exactly once", () => {
    const queue = jobQueueForSeed(SEED);
    expect(queue.length).toBe(DELIVERY_JOBS.length);
    expect(new Set(queue).size).toBe(DELIVERY_JOBS.length);
  });
});

describe("delivery state machine", () => {
  test("pickup only succeeds at the active job's origin while not already carrying", () => {
    let run = playing();
    const first = jobById(activeJobId(run)!);
    const wrongVillage = first.originId === "ridgehome" ? "northpoint" : "ridgehome";
    expect(pickupPackage(run, wrongVillage)).toBe(run);

    run = pickupPackage(run, first.originId);
    expect(run.carried?.jobId).toBe(first.id);
    expect(run.queue).not.toContain(first.id);

    const second = jobById(run.queue[0]!);
    expect(pickupPackage(run, second.originId)).toBe(run);
  });

  test("deliver only succeeds at the carried job's destination", () => {
    let run = playing();
    const job = jobById(activeJobId(run)!);
    run = pickupPackage(run, job.originId);
    expect(deliverPackage(run, job.originId)).toBe(run);

    const delivered = deliverPackage(run, job.destinationId);
    expect(delivered.carried).toBeNull();
    expect(delivered.completed).toBe(1);
    expect(delivered.log.at(-1)).toEqual({ jobId: job.id, outcome: "delivered", at: delivered.elapsed });
  });

  test("a lapsed deadline expires the carried package instead of delivering", () => {
    let run = playing();
    const job = jobById(activeJobId(run)!);
    run = pickupPackage(run, job.originId);
    run = advanceElapsed(run, job.deadlineSeconds + 1);
    expect(run.carried).toBeNull();
    expect(run.log.at(-1)?.outcome).toBe("expired");
  });

  test("touchVillage records the last visited village for respawns", () => {
    const run = touchVillage(playing(), "northpoint");
    expect(run.lastVillageId).toBe("northpoint");
  });
});

describe("win/lose triggers", () => {
  test("completing the required deliveries wins the run", () => {
    let run = playing();
    for (let i = 0; i < REQUIRED_DELIVERIES; i += 1) {
      const job = jobById(activeJobId(run)!);
      run = pickupPackage(run, job.originId);
      run = deliverPackage(run, job.destinationId);
    }
    expect(run.status).toBe("won");
    expect(run.completed).toBe(REQUIRED_DELIVERIES);
  });

  test("running out of jobs before reaching the requirement loses on deadline", () => {
    let run = playing();
    while (run.status === "playing" && run.completed < REQUIRED_DELIVERIES) {
      const job = jobById(activeJobId(run)!);
      run = pickupPackage(run, job.originId);
      run = advanceElapsed(run, run.elapsed + job.deadlineSeconds + 1);
    }
    expect(run.status).toBe("lost");
    expect(run.loseReason).toBe("deadline");
  });

  test("drowning enough times loses to the tide", () => {
    let run = playing();
    for (let i = 0; i < MAX_DROWNS; i += 1) run = applyDrown(run);
    expect(run.status).toBe("lost");
    expect(run.loseReason).toBe("tide");
  });

  test("drowning under the cap respawns with a time penalty and returns the carried package", () => {
    let run = playing();
    const job = jobById(activeJobId(run)!);
    run = pickupPackage(run, job.originId);
    const before = run.elapsed;
    run = applyDrown(run);
    expect(run.status).toBe("playing");
    expect(run.carried).toBeNull();
    expect(run.queue[0]).toBe(job.id);
    expect(run.respawnFreezeUntil).toBeGreaterThan(before);
    expect(isFrozen(run)).toBe(true);
  });
});

describe("restart purity", () => {
  test("restart returns to the exact initial state for its seed", () => {
    let run = playing();
    const job = jobById(activeJobId(run)!);
    run = pickupPackage(run, job.originId);
    run = applyDrown(run);
    run = advanceElapsed(run, 30);

    const restarted = restartRun(SEED);
    expect(restarted).toEqual(createInitialRun(SEED));
    expect(restarted.status).toBe("start");
    expect(restarted.carried).toBeNull();
    expect(restarted.drownCount).toBe(0);
    expect(restarted.lastVillageId).toBe(HOME_VILLAGE_ID);
  });

  test("a second run from the same seed does not see the first run's progress", () => {
    let runA = playing();
    runA = pickupPackage(runA, jobById(activeJobId(runA)!).originId);

    const runB = playing();
    expect(runB.carried).toBeNull();
    expect(runB.queue).toEqual(createInitialRun(SEED).queue);
  });
});
