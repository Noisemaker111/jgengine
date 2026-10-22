import { describe, expect, test } from "bun:test";
import { PerspectiveCamera, Scene } from "three";

import { createShaderWarmup, type ShaderWarmupOptions, type ShaderWarmupState } from "./shaderWarmup";

interface FakeProgram {
  isReady(): boolean;
}

function fixture(
  overrides: Partial<ShaderWarmupOptions> & { linkPerRound?: readonly number[]; readyAfterPolls?: number } = {},
) {
  const { linkPerRound = [3], readyAfterPolls = 0, ...rest } = overrides;
  const rounds: number[] = [];
  let starts = 0;
  const states: ShaderWarmupState[] = [];
  const renderer = {
    info: { programs: [] as FakeProgram[] },
    compile() {
      rounds.push(rounds.length);
      const linked = linkPerRound[rounds.length - 1] ?? 0;
      for (let i = 0; i < linked; i += 1) {
        let polls = 0;
        renderer.info.programs.push({ isReady: () => polls++ >= readyAfterPolls });
      }
    },
  };
  const warmup = createShaderWarmup({
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    quietMs: 0,
    sleep: async () => {},
    now: () => 0,
    loaderQuiet: () => true,
    loaderStarts: () => starts,
    onState: (state) => states.push(state),
    ...rest,
  });
  return {
    warmup,
    rounds,
    states,
    renderer,
    /** Simulate a new burst of model loading between rounds. */
    stream: () => {
      starts += 1;
    },
  };
}

describe("createShaderWarmup", () => {
  test("compiles the mounted scene once and stops when nothing is still streaming", async () => {
    const { warmup, rounds, states } = fixture();
    const final = await warmup.done;

    expect(rounds).toHaveLength(1);
    expect(final.phase).toBe("ready");
    expect(final.rounds).toBe(1);
    expect(final.programs).toBe(3);
    expect(states.some((state) => state.phase === "compiling")).toBe(true);
  });

  test("runs another round for each burst of streamed models", async () => {
    const { warmup, rounds, stream } = fixture({ linkPerRound: [2, 4] });
    // First round starts, then a model burst lands before the quiet check.
    const started = warmup.done;
    stream();
    const final = await started;

    expect(rounds).toHaveLength(2);
    expect(final.rounds).toBe(2);
    expect(final.programs).toBe(6);
  });

  test("a quiet loader with no new programs ends the warmup after one round", async () => {
    const { warmup, rounds } = fixture({ linkPerRound: [0] });
    const final = await warmup.done;

    expect(rounds).toHaveLength(1);
    expect(final.programs).toBe(0);
    expect(final.phase).toBe("ready");
  });

  test("waits for the driver to report every program usable", async () => {
    let clock = 0;
    const { warmup, rounds } = fixture({
      linkPerRound: [2],
      readyAfterPolls: 3,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    const final = await warmup.done;

    expect(rounds).toHaveLength(1);
    expect(final.phase).toBe("ready");
    expect(clock).toBeGreaterThanOrEqual(20);
  });

  test("gives up instead of chasing a scene that never goes quiet", async () => {
    let clock = 0;
    const { warmup, rounds } = fixture({
      linkPerRound: [1, 1, 1, 1],
      quietMs: 100,
      budgetMs: 250,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      loaderQuiet: () => false,
    });
    const final = await warmup.done;

    expect(final.phase).toBe("ready");
    expect(rounds).toHaveLength(1);
    expect(final.elapsedMs).toBeGreaterThanOrEqual(250);
  });

  test("waits out a burst in flight before deciding the round was the last", async () => {
    let clock = 0;
    let busyFor = 2;
    let starts = 0;
    const { warmup, rounds } = fixture({
      linkPerRound: [2, 1],
      quietMs: 100,
      budgetMs: 5_000,
      streamWaitMs: 1_000,
      sleep: async (ms) => {
        clock += ms;
        busyFor -= 1;
        if (busyFor === 0) starts += 1;
      },
      now: () => clock,
      loaderQuiet: () => busyFor <= 0,
      loaderStarts: () => starts,
    });
    const final = await warmup.done;

    expect(rounds).toHaveLength(2);
    expect(final.rounds).toBe(2);
    expect(final.phase).toBe("ready");
  });

  test("a renderer that refuses to compile still releases the loading screen", async () => {
    const { warmup, rounds, states } = fixture({
      renderer: {
        info: { programs: [] },
        compile() {
          throw new Error("GL context lost");
        },
      },
    });
    const final = await warmup.done;

    expect(rounds).toHaveLength(0);
    expect(final.phase).toBe("failed");
    expect(states.at(-1)?.phase).toBe("failed");
  });

  test("a program that never reports usable is cut off by the round floor", async () => {
    const started = Date.now();
    const warmup = createShaderWarmup({
      renderer: {
        info: { programs: [{ isReady: () => false }] },
        compile() {
          this.info.programs.push({ isReady: () => false });
        },
      },
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      budgetMs: 0,
      quietMs: 0,
    });
    const final = await warmup.done;

    expect(final.phase).toBe("ready");
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_000);
  }, 10_000);

  test("cancel stops the next round but resolves the promise", async () => {
    let clock = 0;
    const { warmup, rounds } = fixture({
      quietMs: 100,
      budgetMs: 10_000,
      sleep: async (ms) => {
        clock += ms;
        warmup.cancel();
      },
      now: () => clock,
      loaderQuiet: () => false,
    });
    const final = await warmup.done;

    expect(rounds).toHaveLength(1);
    expect(final.phase).toBe("ready");
  });
});
