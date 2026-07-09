import { describe, expect, test } from "bun:test";

import { createDevtools, formatLogMessage, instrumentLatency } from "./devtools";

describe("devtools controls", () => {
  test("infers slider for numbers with derived bounds", () => {
    const dev = createDevtools();
    const gravity = dev.controls.register("physics/gravity", -22);
    expect(gravity.kind).toBe("slider");
    const control = dev.controls.get("physics/gravity");
    expect(control?.group).toBe("physics");
    expect(control?.label).toBe("gravity");
    expect(control?.min).toBe(-44);
    expect(control?.max).toBe(0);
  });

  test("infers toggle, color, select, and text kinds", () => {
    const dev = createDevtools();
    expect(dev.controls.register("a", true).kind).toBe("toggle");
    expect(dev.controls.register("b", "#ff8800").kind).toBe("color");
    expect(dev.controls.register("c", "easy", { options: ["easy", "hard"] }).kind).toBe("select");
    expect(dev.controls.register("d", "hello").kind).toBe("text");
  });

  test("set clamps sliders, fires subscribers, reset restores initial", () => {
    const dev = createDevtools();
    const health = dev.controls.register("balance/startHealth", 100, { min: 0, max: 200 });
    const seen: number[] = [];
    health.subscribe((value) => seen.push(value));
    health.set(110);
    health.set(9999);
    expect(health.value).toBe(200);
    health.reset();
    expect(health.value).toBe(100);
    expect(seen).toEqual([110, 200, 100]);
  });

  test("re-registering a name keeps the tweaked value", () => {
    const dev = createDevtools();
    const first = dev.controls.register("speed", 5);
    first.set(8);
    const second = dev.controls.register("speed", 5);
    expect(second.value).toBe(8);
    expect(dev.controls.list()).toHaveLength(1);
  });

  test("resetAll restores every control", () => {
    const dev = createDevtools();
    const a = dev.controls.register("a", 1);
    const b = dev.controls.register("b", true);
    a.set(2);
    b.set(false);
    dev.controls.resetAll();
    expect(a.value).toBe(1);
    expect(b.value).toBe(true);
  });
});

describe("devtools frame stats", () => {
  test("derives fps, percentiles, and long-frame counts", () => {
    const dev = createDevtools();
    for (let i = 0; i < 100; i += 1) dev.frame.record({ frameMs: 16, simMs: 2 });
    dev.frame.record({ frameMs: 50, simMs: 30 });
    const stats = dev.frame.stats();
    expect(stats).not.toBeNull();
    expect(stats!.fps).toBeGreaterThan(50);
    expect(stats!.maxFrameMs).toBe(50);
    expect(stats!.maxSimMs).toBe(30);
    expect(stats!.longFrames).toBe(1);
    expect(stats!.samples).toBe(101);
  });

  test("returns null before any sample", () => {
    expect(createDevtools().frame.stats()).toBeNull();
  });
});

describe("devtools logs and latency", () => {
  test("log buffer caps and formats structured args", () => {
    const dev = createDevtools();
    for (let i = 0; i < 250; i += 1) dev.logs.push("log", `entry ${i}`);
    expect(dev.logs.list()).toHaveLength(200);
    expect(dev.logs.list()[199]!.message).toBe("entry 249");
    expect(formatLogMessage(["spawned", { id: 4 }])).toBe('spawned {"id":4}');
  });

  test("latency stats aggregate samples", () => {
    const dev = createDevtools();
    dev.latency.record(20);
    dev.latency.record(40);
    const stats = dev.latency.stats();
    expect(stats!.avgMs).toBe(30);
    expect(stats!.lastMs).toBe(40);
    expect(stats!.minMs).toBe(20);
    expect(stats!.maxMs).toBe(40);
  });

  test("instrumentLatency records promise round trips", async () => {
    const samples: number[] = [];
    const target = {
      run: async (value: number) => value * 2,
      sync: (value: number) => value,
    };
    const wrapped = instrumentLatency(target, ["run", "sync"], (ms) => samples.push(ms));
    expect(await wrapped.run(4)).toBe(8);
    expect(wrapped.sync(3)).toBe(3);
    expect(samples).toHaveLength(1);
  });
});

describe("devtools snapshot", () => {
  test("bundles frame, controls, probes, and logs", () => {
    const dev = createDevtools();
    dev.frame.record({ frameMs: 16, simMs: 1 });
    dev.controls.register("x", 1).set(2);
    dev.probes.register("entities", () => 42);
    dev.logs.push("warn", "careful");
    const snapshot = dev.snapshot();
    expect(snapshot.frame?.samples).toBe(1);
    expect(snapshot.controls).toEqual([{ name: "x", kind: "slider", value: 2, initial: 1 }]);
    expect(snapshot.probes["entities"]).toBe(42);
    expect(snapshot.logs[0]!.message).toBe("careful");
  });

  test("probe failures are reported inline", () => {
    const dev = createDevtools();
    dev.probes.register("boom", () => {
      throw new Error("nope");
    });
    expect(dev.snapshot().probes["boom"]).toBe("probe failed: Error: nope");
  });
});
