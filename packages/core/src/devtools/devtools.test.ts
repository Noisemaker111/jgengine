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

describe("devtools discovery", () => {
  test("scans flat primitive tables and skips non-containers", () => {
    const dev = createDevtools();
    const MINING = { reach: 6, instaBreak: false, highlight: "#ffd166", name: "pick", fn: () => 1 };
    expect(dev.discover.scanTable("MINING", MINING)).toBe(3);
    expect(dev.discover.scanTable("nope", 6)).toBe(0);
    expect(dev.discover.scanTable("nope", new Map())).toBe(0);
    const ids = dev.discover.list().map((entry) => entry.id);
    expect(ids).toEqual(["MINING/reach", "MINING/instaBreak", "MINING/highlight"]);
    expect(dev.discover.list()[0]!.kind).toBe("slider");
    expect(dev.discover.list()[2]!.kind).toBe("color");
  });

  test("recurses nested tables and arrays into dotted paths that mutate in place", () => {
    const dev = createDevtools();
    const playable = {
      shadows: true,
      camera: { rig: "chase", chase: { distance: 8 } },
      game: { physics: { gravity: -24 } },
      waves: [{ speed: 2.2 }, { speed: 3 }],
    };
    dev.discover.scanTable("game", playable);
    const ids = dev.discover.list().map((entry) => entry.id);
    expect(ids).toContain("game/shadows");
    expect(ids).toContain("game/camera.chase.distance");
    expect(ids).toContain("game/game.physics.gravity");
    expect(ids).toContain("game/waves.0.speed");
    dev.discover.enable("game/camera.chase.distance");
    dev.controls.get("game/camera.chase.distance")!.write(14);
    expect(playable.camera.chase.distance).toBe(14);
    dev.discover.enable("game/waves.1.speed");
    dev.controls.get("game/waves.1.speed")!.write(5);
    expect(playable.waves[1]!.speed).toBe(5);
  });

  test("a property already bound under one table is not duplicated by a later scan", () => {
    const dev = createDevtools();
    const physics = { gravity: -24 };
    dev.discover.scanTable("physics", physics);
    dev.discover.scanTable("game", { game: { physics } });
    const ids = dev.discover.list().map((entry) => entry.id);
    expect(ids).toContain("physics/gravity");
    expect(ids).not.toContain("game/game.physics.gravity");
  });

  test("skips blob levels with too many scalar entries and survives cycles", () => {
    const dev = createDevtools();
    const blob: Record<string, number> = {};
    for (let i = 0; i < 70; i += 1) blob[`k${i}`] = i;
    expect(dev.discover.scanTable("blob", blob)).toBe(0);
    const cyclic: { x: number; self?: unknown } = { x: 1 };
    cyclic.self = cyclic;
    expect(dev.discover.scanTable("cyclic", cyclic)).toBe(1);
  });

  test("caps a single scan at 512 targets", () => {
    const dev = createDevtools();
    const root: Record<string, Record<string, number>> = {};
    for (let group = 0; group < 10; group += 1) {
      const child: Record<string, number> = {};
      for (let i = 0; i < 60; i += 1) child[`v${i}`] = i;
      root[`g${group}`] = child;
    }
    expect(dev.discover.scanTable("big", root)).toBe(512);
  });

  test("scanModule walks exports", () => {
    const dev = createDevtools();
    const total = dev.discover.scanModule({
      MINING: { reach: 6 },
      COLORS: { sky: "#87ceeb" },
      helper: () => 1,
      EYE_HEIGHT: 1.6,
    });
    expect(total).toBe(2);
    expect(dev.discover.list()).toHaveLength(2);
  });

  test("enable creates a control that mutates the table in place; disable restores", () => {
    const dev = createDevtools();
    const MINING = { reach: 6 };
    dev.discover.scanTable("MINING", MINING);
    dev.discover.enable("MINING/reach");
    const control = dev.controls.get("MINING/reach");
    expect(control).not.toBeNull();
    control!.write(12);
    expect(MINING.reach).toBe(12);
    dev.discover.disable("MINING/reach");
    expect(MINING.reach).toBe(6);
    expect(dev.controls.get("MINING/reach")).toBeNull();
    expect(dev.discover.list()[0]!.enabled).toBe(false);
  });

  test("rescan with a new table reference keeps enabled overrides applied", () => {
    const dev = createDevtools();
    const first = { reach: 6 };
    dev.discover.scanTable("MINING", first);
    dev.discover.enable("MINING/reach");
    dev.controls.get("MINING/reach")!.write(10);
    const reloaded = { reach: 6 };
    dev.discover.scanTable("MINING", reloaded);
    expect(reloaded.reach).toBe(10);
  });

  test("overrides export/apply round trip", () => {
    const dev = createDevtools();
    const MINING = { reach: 6, instaBreak: false };
    dev.discover.scanTable("MINING", MINING);
    dev.discover.enable("MINING/reach");
    dev.controls.get("MINING/reach")!.write(9);
    const saved = dev.overrides.export();
    expect(saved).toEqual({ enabled: ["MINING/reach"], values: { "MINING/reach": 9 } });

    const fresh = createDevtools();
    const MINING2 = { reach: 6, instaBreak: false };
    fresh.discover.scanTable("MINING", MINING2);
    fresh.overrides.apply(saved);
    expect(MINING2.reach).toBe(9);
    expect(fresh.discover.list()[0]!.enabled).toBe(true);
  });

  test("snapshot includes discovered entries", () => {
    const dev = createDevtools();
    dev.discover.scanTable("MINING", { reach: 6 });
    expect(dev.snapshot().discovered).toEqual([
      { id: "MINING/reach", kind: "slider", value: 6, enabled: false },
    ]);
  });

  test("clear resets enabled entries and empties the registry", () => {
    const dev = createDevtools();
    const MINING = { reach: 6 };
    dev.discover.scanTable("MINING", MINING);
    dev.discover.enable("MINING/reach");
    dev.controls.get("MINING/reach")!.write(14);
    dev.discover.clear();
    expect(MINING.reach).toBe(6);
    expect(dev.discover.list()).toHaveLength(0);
    expect(dev.controls.get("MINING/reach")).toBeNull();
  });
});
