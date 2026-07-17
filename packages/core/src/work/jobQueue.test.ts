import { describe, expect, test } from "bun:test";

import {
  activeJobs,
  cancelJob,
  createWorkQueue,
  enqueue,
  fifoOrdering,
  jobById,
  jobProgress,
  pauseJob,
  queueSize,
  queuedJobs,
  resumeJob,
  tick,
  type WorkQueueConfig,
} from "./jobQueue";

interface BuildSpec {
  itemId: string;
  seconds: number;
}
interface Cost {
  gold: number;
}
interface Output {
  produced: string;
}

const config: WorkQueueConfig<BuildSpec, Cost, Output> = {
  duration: (spec) => spec.seconds,
  reserve: (spec) => ({ gold: spec.itemId === "knight" ? 100 : 40 }),
  output: (job) => ({ produced: job.spec.itemId }),
};

function seed(): ReturnType<typeof createWorkQueue<BuildSpec, Cost>> {
  return createWorkQueue<BuildSpec, Cost>();
}

describe("work queue — enqueue + reservation", () => {
  test("assigns stable ids and stores the computed reservation", () => {
    let state = seed();
    const first = enqueue(state, config, { itemId: "knight", seconds: 3 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.state;
    expect(first.job.id).toBe("job-1");
    expect(first.job.reservation.gold).toBe(100);
    expect(first.job.status).toBe("queued");

    const second = enqueue(state, config, { itemId: "archer", seconds: 2 });
    if (!second.ok) return;
    expect(second.job.id).toBe("job-2");
    expect(queueSize(second.state)).toBe(2);
  });

  test("capacity rejects further enqueues without mutating state", () => {
    const capped: WorkQueueConfig<BuildSpec, Cost, Output> = { ...config, capacity: 1 };
    let state = seed();
    const first = enqueue(state, capped, { itemId: "archer", seconds: 2 });
    if (!first.ok) return;
    state = first.state;
    const second = enqueue(state, capped, { itemId: "archer", seconds: 2 });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("capacity");
    expect(queueSize(second.state)).toBe(1);
  });

  test("validate policy blocks an unaffordable enqueue", () => {
    const gated: WorkQueueConfig<BuildSpec, Cost, Output> = {
      ...config,
      validate: (spec) => (spec.itemId === "knight" ? { ok: false, reason: "too-poor" } : { ok: true }),
    };
    const state = seed();
    const rejected = enqueue(state, gated, { itemId: "knight", seconds: 3 });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.reason).toBe("too-poor");
  });
});

describe("work queue — tick, completion, output routing", () => {
  test("advances one job and emits started then completed with output", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "archer", seconds: 2 }).state;

    let result = tick(state, config, 1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.type).toBe("started");
    expect(result.events[0]!.job.elapsed).toBe(0); // started snapshots the job as it enters the slot
    state = result.state;
    expect(jobProgress(jobById(state, "job-1")!)).toBeCloseTo(0.5);

    result = tick(state, config, 1);
    state = result.state;
    const completed = result.events.find((e) => e.type === "completed");
    expect(completed?.type).toBe("completed");
    if (completed?.type === "completed") expect(completed.output.produced).toBe("archer");
    // completed jobs are removed from state
    expect(queueSize(state)).toBe(0);
    expect(jobById(state, "job-1")).toBeNull();
  });

  test("routes completion output through a consumer adapter", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "knight", seconds: 1 }).state;
    const spawned: string[] = [];
    const result = tick(state, config, 1);
    for (const event of result.events) {
      if (event.type === "completed") spawned.push(event.output.produced);
    }
    expect(spawned).toEqual(["knight"]);
  });

  test("zero-duration job completes on the first tick", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "instant", seconds: 0 }).state;
    const result = tick(state, config, 0.016);
    expect(result.events.some((e) => e.type === "completed")).toBe(true);
    expect(queueSize(result.state)).toBe(0);
  });

  test("dt <= 0 is a no-op", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "archer", seconds: 2 }).state;
    const result = tick(state, config, 0);
    expect(result.events).toHaveLength(0);
    expect(result.state).toBe(state);
  });
});

describe("work queue — ordering", () => {
  test("FIFO by default within equal priority", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "a", seconds: 1 }).state;
    state = enqueue(state, config, { itemId: "b", seconds: 1 }).state;
    const order = queuedJobs(state).map((j) => j.spec.itemId);
    expect(order).toEqual(["a", "b"]);
  });

  test("higher priority is selected first", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "low", seconds: 1 }).state;
    state = enqueue(state, config, { itemId: "high", seconds: 1 }, { priority: 5 }).state;
    const started = tick(state, config, 0.1).events.find((e) => e.type === "started");
    expect(started?.type === "started" && started.job.spec.itemId).toBe("high");
  });

  test("pluggable FIFO ordering ignores priority", () => {
    const fifo: WorkQueueConfig<BuildSpec, Cost, Output> = { ...config, ordering: fifoOrdering };
    let state = seed();
    state = enqueue(state, fifo, { itemId: "first", seconds: 1 }).state;
    state = enqueue(state, fifo, { itemId: "second", seconds: 1 }, { priority: 99 }).state;
    const started = tick(state, fifo, 0.1).events.find((e) => e.type === "started");
    expect(started?.type === "started" && started.job.spec.itemId).toBe("first");
  });
});

describe("work queue — concurrency", () => {
  test("runs up to N jobs at once", () => {
    const parallel: WorkQueueConfig<BuildSpec, Cost, Output> = { ...config, concurrency: 2 };
    let state = seed();
    state = enqueue(state, parallel, { itemId: "a", seconds: 4 }).state;
    state = enqueue(state, parallel, { itemId: "b", seconds: 4 }).state;
    state = enqueue(state, parallel, { itemId: "c", seconds: 4 }).state;
    const result = tick(state, parallel, 1);
    state = result.state;
    expect(activeJobs(state)).toHaveLength(2);
    expect(state.jobs.find((j) => j.spec.itemId === "c")?.status).toBe("queued");
  });
});

describe("work queue — pause / resume", () => {
  test("paused job holds progress and yields its slot", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "a", seconds: 4 }).state;
    state = enqueue(state, config, { itemId: "b", seconds: 4 }).state;
    state = tick(state, config, 1).state; // job-1 active, 1/4 done
    state = pauseJob(state, "job-1");
    expect(jobById(state, "job-1")!.status).toBe("paused");
    expect(jobProgress(jobById(state, "job-1")!)).toBeCloseTo(0.25);

    // b now gets the slot
    const started = tick(state, config, 0.1).events.find((e) => e.type === "started");
    expect(started?.type === "started" && started.job.spec.itemId).toBe("b");

    state = resumeJob(state, "job-1");
    expect(jobById(state, "job-1")!.status).toBe("queued");
    expect(jobProgress(jobById(state, "job-1")!)).toBeCloseTo(0.25);
  });
});

describe("work queue — cancellation", () => {
  test("cancel removes the job and refunds the full reservation by default", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "knight", seconds: 3 }).state;
    const cancelled = cancelJob(state, config, "job-1");
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.refund).toEqual({ gold: 100 });
    expect(queueSize(cancelled.state)).toBe(0);
  });

  test("partial refund via config.refund uses progress", () => {
    const halfBack: WorkQueueConfig<BuildSpec, Cost, Output> = {
      ...config,
      refund: (job, progress) => ({ gold: Math.round(job.reservation.gold * (1 - progress)) }),
    };
    let state = seed();
    state = enqueue(state, halfBack, { itemId: "knight", seconds: 4 }).state;
    state = tick(state, halfBack, 1).state; // 25% done
    const cancelled = cancelJob(state, halfBack, "job-1");
    if (!cancelled.ok) return;
    expect(cancelled.refund).toEqual({ gold: 75 });
  });

  test("cancelling a missing job (completion race) reports not-found", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "archer", seconds: 1 }).state;
    state = tick(state, config, 2).state; // completes and is removed
    const cancelled = cancelJob(state, config, "job-1");
    expect(cancelled.ok).toBe(false);
    if (cancelled.ok) return;
    expect(cancelled.reason).toBe("not-found");
  });
});

describe("work queue — large-delta catch-up", () => {
  test("a single big tick drains a FIFO chain in order with leftover carry-over", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "a", seconds: 2 }).state;
    state = enqueue(state, config, { itemId: "b", seconds: 2 }).state;
    state = enqueue(state, config, { itemId: "c", seconds: 2 }).state;
    const result = tick(state, config, 100);
    const completed = result.events.filter((e) => e.type === "completed").map((e) => (e.type === "completed" ? e.output.produced : ""));
    expect(completed).toEqual(["a", "b", "c"]);
    expect(queueSize(result.state)).toBe(0);
  });

  test("catch-up leaves the in-flight job with the correct remaining progress", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "a", seconds: 2 }).state;
    state = enqueue(state, config, { itemId: "b", seconds: 10 }).state;
    const result = tick(state, config, 5); // a (2s) completes, 3s carries into b
    state = result.state;
    expect(result.events.filter((e) => e.type === "completed")).toHaveLength(1);
    expect(jobProgress(jobById(state, "job-2")!)).toBeCloseTo(0.3);
  });
});

describe("work queue — serialization", () => {
  test("state round-trips through JSON unchanged and resumes ticking", () => {
    let state = seed();
    state = enqueue(state, config, { itemId: "knight", seconds: 4 }).state;
    state = enqueue(state, config, { itemId: "archer", seconds: 2 }).state;
    state = tick(state, config, 1).state; // some progress

    const roundTripped = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(roundTripped).toEqual(state);

    // Resuming from the reloaded state produces the same completions.
    const fromLive = tick(state, config, 3);
    const fromReload = tick(roundTripped, config, 3);
    expect(fromReload.events).toEqual(fromLive.events);
    expect(fromReload.state).toEqual(fromLive.state);
  });
});
