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
    expect(stats!.avgOutsideMs).toBeGreaterThan(0);
  });

  test("returns null before any sample", () => {
    expect(createDevtools().frame.stats()).toBeNull();
  });

  test("profile.measure attributes phases and explains long frames", () => {
    const dev = createDevtools();
    dev.probes.register("entities", () => 12);
    dev.profile.add("onTick", 18);
    dev.profile.add("pose", 3);
    dev.frame.record({ frameMs: 40, simMs: 22 });
    const stats = dev.frame.stats();
    expect(stats).not.toBeNull();
    expect(stats!.phases.map((phase) => phase.name)).toContain("onTick");
    expect(stats!.phases.map((phase) => phase.name)).toContain("pose");
    expect(stats!.phases[0]!.name).toBe("onTick");
    const longs = dev.frame.longFrames();
    expect(longs).toHaveLength(1);
    expect(longs[0]!.culprit).toBe("onTick");
    expect(longs[0]!.reason).toContain("onTick");
    expect(longs[0]!.phases[0]!.name).toBe("onTick");
    expect(longs[0]!.probes["entities"]).toBe(12);
    expect(longs[0]!.outsideMs).toBeCloseTo(18, 0);
  });

  test("outside-sim hitch is diagnosed when sim is light", () => {
    const dev = createDevtools();
    dev.profile.add("onTick", 1);
    dev.frame.record({ frameMs: 50, simMs: 2 });
    const event = dev.frame.longFrames()[0]!;
    expect(event.culprit).toBe("outside-sim");
    expect(event.reason).toContain("outside sim");
  });

  test("explicit phases override the in-flight profile buffer", () => {
    const dev = createDevtools();
    dev.profile.add("stale", 99);
    dev.frame.record({ frameMs: 40, simMs: 25, phases: { physics: 18, ai: 4 } });
    const event = dev.frame.longFrames()[0]!;
    expect(event.culprit).toBe("physics");
    expect(event.phases.map((phase) => phase.name)).toEqual(["physics", "ai"]);
    expect(dev.profile.current()).toEqual({});
  });

  test("clearLongFrames empties the log", () => {
    const dev = createDevtools();
    dev.frame.record({ frameMs: 40, simMs: 5 });
    expect(dev.frame.longFrames()).toHaveLength(1);
    dev.frame.clearLongFrames();
    expect(dev.frame.longFrames()).toHaveLength(0);
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
  test("bundles frame, controls, probes, logs, and long frames", () => {
    const dev = createDevtools();
    dev.profile.add("onTick", 20);
    dev.frame.record({ frameMs: 40, simMs: 22 });
    dev.controls.register("x", 1).set(2);
    dev.probes.register("entities", () => 42);
    dev.logs.push("warn", "careful");
    const snapshot = dev.snapshot();
    expect(snapshot.frame?.samples).toBe(1);
    expect(snapshot.frame?.phases[0]?.name).toBe("onTick");
    expect(snapshot.longFrames).toHaveLength(1);
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
    expect(saved.version).toBe(1);
    expect(saved.enabled).toEqual(["MINING/reach"]);
    expect(saved.values).toEqual({ "MINING/reach": 9 });
    expect(saved.schemas?.["MINING/reach"]?.kind).toBe("slider");

    const fresh = createDevtools();
    const MINING2 = { reach: 6, instaBreak: false };
    fresh.discover.scanTable("MINING", MINING2);
    const result = fresh.overrides.apply(saved);
    expect(result.applied).toBeGreaterThan(0);
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

  test("escapes dotted keys and surfaces skipped unsupported structures", () => {
    const dev = createDevtools();
    const table = {
      "spawn.point": 3,
      nested: { "a.b": 4 },
      weird: new Map([["x", 1]]),
    };
    expect(dev.discover.scanTable("CFG", table)).toBe(2);
    const ids = dev.discover.list().map((entry) => entry.id);
    expect(ids).toContain("CFG/spawn\\.point");
    expect(ids).toContain("CFG/nested.a\\.b");
    expect(dev.discover.skipped().some((entry) => entry.reason === "unsupported structure")).toBe(true);
    dev.discover.enable("CFG/nested.a\\.b");
    dev.controls.get("CFG/nested.a\\.b")!.write(7);
    expect(table.nested["a.b"]).toBe(7);
  });

  test("scan meta declares semantic nested fields", () => {
    const dev = createDevtools();
    const config = {
      spawn: { position: [1, 2, 3] as [number, number, number] },
      zoom: { min: 2, max: 12 },
    };
    dev.discover.scanTable("game", config, {
      "spawn.position": { kind: "vec3" },
      "zoom": { kind: "interval", min: 0, max: 20 },
    });
    const kinds = Object.fromEntries(dev.discover.list().map((entry) => [entry.id, entry.kind]));
    expect(kinds["game/spawn.position"]).toBe("vec3");
    expect(kinds["game/zoom"]).toBe("interval");
  });
});

describe("devtools structured tunables", () => {
  test("vec3 atomic write, axis bounds, reset, and export/apply", () => {
    const dev = createDevtools();
    const spawn = dev.controls.register("spawn/pos", [0, 1, 0] as [number, number, number], {
      kind: "vec3",
      axisMin: [-10, 0, -10],
      axisMax: [10, 5, 10],
    });
    expect(spawn.kind).toBe("vec3");
    const seen: unknown[] = [];
    spawn.subscribe((value) => seen.push(value.slice()));
    expect(spawn.set([100, 2, -100])).toBe(true);
    expect(spawn.value).toEqual([10, 2, -10]);
    expect(seen).toEqual([[10, 2, -10]]);
    expect(spawn.set([1, Number.NaN, 1])).toBe(false);
    expect(spawn.value).toEqual([10, 2, -10]);
    spawn.reset();
    expect(spawn.value).toEqual([0, 1, 0]);
    spawn.set([3, 4, 5]);
    const saved = dev.overrides.export();
    const fresh = createDevtools();
    const other = fresh.controls.register("spawn/pos", [0, 1, 0] as [number, number, number], {
      kind: "vec3",
      axisMin: [-10, 0, -10],
      axisMax: [10, 5, 10],
    });
    expect(fresh.overrides.apply(saved).applied).toBe(1);
    expect(other.value).toEqual([3, 4, 5]);
  });

  test("interval enforces order, integer mode, and atomic persistence", () => {
    const dev = createDevtools();
    const range = dev.controls.register("camera/zoom", { min: 4, max: 12 }, {
      kind: "interval",
      min: 0,
      max: 20,
      integer: true,
    });
    expect(range.set({ min: 15, max: 8 })).toBe(true);
    expect(range.value).toEqual({ min: 8, max: 15 });
    expect(range.set({ min: 1.5, max: 3 })).toBe(false);
    expect(range.value).toEqual({ min: 8, max: 15 });
    range.reset();
    expect(range.value).toEqual({ min: 4, max: 12 });
    range.set({ min: 1, max: 3 });
    const saved = dev.overrides.export();
    const fresh = createDevtools();
    const other = fresh.controls.register("camera/zoom", { min: 4, max: 12 }, {
      kind: "interval",
      min: 0,
      max: 20,
      integer: true,
    });
    fresh.overrides.apply(saved);
    expect(other.value).toEqual({ min: 1, max: 3 });
  });

  test("angle keeps canonical radians and wraps display-domain writes", () => {
    const dev = createDevtools();
    const yaw = dev.controls.register("camera/yaw", Math.PI / 2, {
      kind: "angle",
      unit: "rad",
      displayUnit: "deg",
      wrap: true,
      min: -Math.PI,
      max: Math.PI,
    });
    expect(yaw.kind).toBe("angle");
    expect(yaw.set((3 * Math.PI) / 2)).toBe(true);
    expect(yaw.value).toBeCloseTo(-Math.PI / 2, 10);
    expect(yaw.set(Number.POSITIVE_INFINITY)).toBe(false);
    yaw.reset();
    expect(yaw.value).toBeCloseTo(Math.PI / 2, 10);
    const control = dev.controls.get("camera/yaw");
    expect(control?.unit).toBe("rad");
    expect(control?.displayUnit).toBe("deg");
  });

  test("color normalizes short hex, preserves alpha, rejects invalid", () => {
    const dev = createDevtools();
    const fill = dev.controls.register("ui/fill", "#F80");
    expect(fill.kind).toBe("color");
    expect(fill.value).toBe("#ff8800");
    const tint = dev.controls.register("ui/tint", "#88ff0011");
    expect(tint.value).toBe("#88ff0011");
    expect(dev.controls.get("ui/tint")?.hasAlpha).toBe(true);
    expect(tint.set("#00ff00")).toBe(true);
    expect(tint.value).toBe("#00ff00ff");
    expect(tint.set("#00ff0080")).toBe(true);
    expect(tint.value).toBe("#00ff0080");
    expect(tint.set("red")).toBe(false);
    expect(tint.value).toBe("#00ff0080");
    tint.reset();
    expect(tint.value).toBe("#88ff0011");
  });

  test("enum labeled choices validate writes and stale overrides", () => {
    const dev = createDevtools();
    const mode = dev.controls.register("game/mode", "easy", {
      kind: "enum",
      choices: [
        { value: "easy", label: "Easy" },
        { value: "hard", label: "Hard" },
      ],
    });
    expect(mode.kind).toBe("enum");
    expect(mode.set("hard")).toBe(true);
    expect(mode.set("nightmare")).toBe(false);
    expect(mode.value).toBe("hard");
    const numeric = dev.controls.register("game/tier", 2, {
      kind: "enum",
      choices: [
        { value: 1, label: "I" },
        { value: 2, label: "II" },
      ],
    });
    expect(numeric.set("2" as unknown as number)).toBe(true);
    expect(numeric.value).toBe(2);
    const saved = dev.overrides.export();
    saved.values["game/mode"] = "legacy";
    const fresh = createDevtools();
    fresh.controls.register("game/mode", "easy", {
      kind: "enum",
      choices: [
        { value: "easy", label: "Easy" },
        { value: "hard", label: "Hard" },
      ],
    });
    const result = fresh.overrides.apply(saved);
    expect(result.skipped.some((entry) => entry.id === "game/mode")).toBe(true);
    expect(fresh.controls.get("game/mode")!.read()).toBe("easy");
  });

  test("versioned overrides migrate legacy payloads and quarantine bad values", () => {
    const dev = createDevtools();
    dev.controls.register("physics/gravity", -22);
    dev.controls.register("spawn/pos", [0, 1, 0] as [number, number, number], { kind: "vec3" });
    dev.controls.register("ui/tint", "#11223344");
    dev.controls.register("camera/zoom", { min: 2, max: 8 }, { kind: "interval" });
    dev.controls.register("game/mode", "easy", {
      kind: "enum",
      choices: [
        { value: "easy", label: "Easy" },
        { value: "hard", label: "Hard" },
      ],
    });

    const legacy = {
      enabled: [],
      values: {
        "physics/gravity": -10,
        "spawn/pos": "nope",
        "ui/tint": "#gg0000",
        "camera/zoom": { min: 9, max: 1 },
        "game/mode": "missing",
        "unknown/id": 1,
      },
    };
    const result = dev.overrides.apply(legacy);
    expect(result.diagnostics.some((message) => message.includes("migrated"))).toBe(true);
    expect(dev.controls.get("physics/gravity")!.read()).toBe(-10);
    expect(dev.controls.get("spawn/pos")!.read()).toEqual([0, 1, 0]);
    expect(dev.controls.get("ui/tint")!.read()).toBe("#11223344");
    expect(dev.controls.get("camera/zoom")!.read()).toEqual({ min: 1, max: 9 });
    expect(dev.controls.get("game/mode")!.read()).toBe("easy");
    expect(result.skipped.map((entry) => entry.id).sort()).toEqual(
      ["game/mode", "spawn/pos", "ui/tint", "unknown/id"].sort(),
    );

    const future = dev.overrides.apply({ version: 99, enabled: [], values: {} });
    expect(future.applied).toBe(0);
    expect(future.diagnostics[0]).toContain("newer than supported");
  });

  test("kind mismatch in stored schema is ignored", () => {
    const dev = createDevtools();
    dev.controls.register("x", 1);
    const result = dev.overrides.apply({
      version: 1,
      enabled: [],
      values: { x: true },
      schemas: { x: { kind: "toggle" } },
    });
    expect(result.skipped[0]?.reason).toContain("kind mismatch");
    expect(dev.controls.get("x")!.read()).toBe(1);
  });
});
