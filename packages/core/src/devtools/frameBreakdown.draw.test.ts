import { expect, test } from "bun:test";

import { joinFrameGroup } from "../render/useSharedFrame.draw";
import { createAmbientFauna } from "../ambientFauna/ambientFauna";
import { createEditableTerrain } from "../terrain/terraform";
import { readBreakdown } from "../../../../scripts/perf-breakdown";
import { FRAME_RETENTION_LIMIT, installFrameBreakdown, measureComposerPasses } from "./frameBreakdown.draw";

test("bounds retained post passes and restores the ones it wraps", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "" } });
  const internal = { subscribers: [], subscribe: () => () => {} };
  const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {} };
  const original = () => {};
  const passes = Array.from({ length: FRAME_RETENTION_LIMIT + 2 }, () => ({ render: original }));
  const breakdown = installFrameBreakdown(renderer as never, { getState: () => ({ internal }) } as never);
  try {
    measureComposerPasses({ passes });
    expect(passes[0]?.render).not.toBe(original);
    expect(passes.at(-1)?.render).toBe(original);
    expect(breakdown.summary().retention?.passes).toBe(2);
  } finally {
    breakdown.dispose();
    expect(passes[0]?.render).toBe(original);
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});

test("bounds retained callbacks and draw identities under churn", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "?frameMembers=1" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = { subscribers, subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
    const entry = { ref, priority }; subscribers.push(entry); subscribers.sort((a, b) => a.priority - b.priority);
    return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
  } };
  const store = { getState: () => ({ internal }) };
  const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {}, renderBufferDirect(_a: unknown, _b: unknown, _c: unknown, _d: unknown, _e: unknown, _f: unknown) {} };
  const breakdown = installFrameBreakdown(renderer as never, store as never);
  const frame = () => { for (const { ref } of subscribers) ref.current({}, 1 / 60); };
  try {
    frame();
    for (let i = 0; i < FRAME_RETENTION_LIMIT + 10; i += 1) {
      const leave = joinFrameGroup(store, internal.subscribe, 0, { current: () => {} });
      frame();
      leave();
      renderer.renderBufferDirect(null, null, {}, { id: i }, { id: i }, null);
    }
    frame();
    const result = breakdown.summary({ top: FRAME_RETENTION_LIMIT + 20 });
    expect(Object.keys(breakdown.callbacks()).length).toBeLessThanOrEqual(FRAME_RETENTION_LIMIT);
    expect(result.objects.length).toBeLessThanOrEqual(FRAME_RETENTION_LIMIT);
    expect(result.materials.length).toBeLessThanOrEqual(FRAME_RETENTION_LIMIT);
    expect(result.retention?.callbacks).toBeGreaterThan(0);
    expect(result.retention?.draws).toBeGreaterThan(0);
  } finally {
    breakdown.dispose();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});

test("a frame names each draw that fed a program a vertex layout or colour target it had not drawn with", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = { subscribers, subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
    const entry = { ref, priority }; subscribers.push(entry);
    return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
  } };
  // One program shared by two materials, as three links one program for every material alike.
  const program = { getAttributes: () => ({ position: {}, color: {} }) };
  const programs = new Map<object, { currentProgram: object }>();
  let target: object | null = null;
  const renderer = {
    getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {},
    properties: { get: (material: object) => programs.get(material) ?? {} },
    getRenderTarget: () => target,
    renderBufferDirect(_a: unknown, _b: unknown, _c: unknown, _d: unknown, _e: unknown, _f: unknown) {},
  };
  const hull = { name: "Hull" };
  const rock = { name: "Rock" };
  programs.set(hull, { currentProgram: program }).set(rock, { currentProgram: program });
  const float3 = { itemSize: 3, array: new Float32Array(3) };
  const plain = { attributes: { position: float3 } };
  const tinted = { attributes: { position: float3, color: { itemSize: 4, normalized: true, array: new Uint8Array(4) } } };
  const breakdown = installFrameBreakdown(renderer as never, { getState: () => ({ internal }) } as never);
  const draws: [object, object, object | null][] = [];
  internal.subscribe({ current: () => { for (const [geometry, material, bound] of draws) { target = bound; renderer.renderBufferDirect(null, null, geometry, material, { name: "Mesh" }, null); } target = null; } }, 0);
  // A frame's record is filed when the next frame starts: draw, then run an empty frame to file it.
  const frame = (next: [object, object, object | null][]) => {
    for (const batch of [next, []]) { draws.splice(0, draws.length, ...batch); for (const { ref } of subscribers) ref.current({}, 1 / 60); }
    // Material name and what was new; the labels' ids and object kind are the recorder's usual naming.
    return breakdown.records().at(-1)?.firstDraws?.map((draw) => `${draw.split("#")[0]} → ${draw.split(" → ")[1]}`);
  };
  const halfFloat = { textures: [{ type: 1016 }] };
  try {
    expect(frame([[plain, hull, null]])).toEqual(["Hull → first draw, screen"]);
    // The same program and layout from another material is no new pair.
    expect(frame([[plain, rock, null], [plain, hull, null]])).toBeUndefined();
    expect(frame([[tinted, rock, null], [plain, hull, halfFloat], [plain, hull, halfFloat]])).toEqual([
      "Rock → screen, new vertex layout color:4n:Uint8Array,position:3:Float32Array",
      "Hull → half-float",
    ]);
    expect(frame([[tinted, rock, halfFloat], [plain, rock, null]])).toEqual(["Rock → half-float"]);
    // The GPU process builds that shader when it reaches the draw: a stall a frame later still names it.
    const msaa = { textures: [{ type: 1016 }], samples: 4 };
    frame([[plain, hull, msaa]]);
    let stall = true;
    internal.subscribe({ current: () => { if (!stall) return; stall = false; const until = performance.now() + 45; while (performance.now() < until); } }, 1);
    frame([]);
    const [hitch] = breakdown.session().hitches;
    expect(hitch?.detail).toContain("first draws of 1 program and layout pair(s): Hull");
    expect(hitch?.detail).toContain("→ half-float msaa (frame before)");
  } finally {
    breakdown.dispose();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});

test("disposing and reinstalling the recorder restores live callbacks", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = { subscribers, subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
    const entry = { ref, priority }; subscribers.push(entry); subscribers.sort((a, b) => a.priority - b.priority);
    return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
  } };
  const store = { getState: () => ({ internal }) };
  const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {} };
  const callback = () => renderer.render();
  const ref = { current: callback };
  internal.subscribe(ref, 0);
  const frame = () => { for (const { ref: task } of subscribers) task.current({}, 1 / 60); };
  const first = installFrameBreakdown(renderer as never, store as never);
  try {
    frame(); frame();
    first.dispose();
    expect(ref.current).toBe(callback);
    const second = installFrameBreakdown(renderer as never, store as never);
    try {
      frame(); frame();
      expect(second.records()[0]?.calls?.["render:main"]).toBe(1);
      expect(Object.values(second.callbacks())).toContain(callback);
    } finally { second.dispose(); }
  } finally {
    first.dispose();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});

test("a remount's late cleanup leaves the next recorder published", () => {
  const prior = Reflect.get(globalThis, "window");
  const page: { location: { search: string }; __jgFrameBreakdown?: unknown } = { location: { search: "" } };
  Reflect.set(globalThis, "window", page);
  const internal = { subscribe: () => () => undefined };
  const store = { getState: () => ({ internal }) };
  const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {} };
  const first = installFrameBreakdown(renderer as never, store as never);
  const second = installFrameBreakdown(renderer as never, store as never);
  try {
    // React mounts the new canvas's recorder, then runs the old one's cleanup.
    first.dispose();
    expect(page.__jgFrameBreakdown).toBe(second);
  } finally {
    second.dispose();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
  expect(page.__jgFrameBreakdown).toBeUndefined();
});

test("records real shared members and repeated render calls through the frame loop", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "?frameMembers=1" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = {
    subscribers,
    subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
      const entry = { ref, priority };
      subscribers.push(entry);
      subscribers.sort((a, b) => a.priority - b.priority);
      return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
    },
  };
  const store = { getState: () => ({ internal }) };
  const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {} };
  const renderTwice = () => { renderer.render(); renderer.render(); };
  let groundReads = 0;
  const ground = () => { groundReads += 1; };
  const leaveA = joinFrameGroup(store, internal.subscribe, 0, { current: renderTwice });
  const leaveB = joinFrameGroup(store, internal.subscribe, 0, { current: ground });
  const breakdown = installFrameBreakdown(renderer as never, store as never);
  try {
    for (let i = 0; i < 2; i += 1) for (const { ref } of subscribers) ref.current({}, 0.016);
    const record = breakdown.records()[0];
    expect(record?.calls?.["render:main"]).toBe(2);
    const labels = Object.entries(breakdown.callbacks()).filter(([name]) => name.includes("sharedMember"));
    expect(labels.map(([, callback]) => callback)).toEqual([renderTwice, ground]);
    for (const [label] of labels) expect(record?.calls?.[label]).toBe(1);
    expect(groundReads).toBe(2);
    expect(record?.gpu).toBeNull();
  } finally {
    breakdown.dispose();
    leaveA();
    leaveB();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", prior);
  }
});

test("unresolved and disjoint GPU queries remain unavailable until complete", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = { subscribers, subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
    const entry = { ref, priority }; subscribers.push(entry); subscribers.sort((a, b) => a.priority - b.priority);
    return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
  } };
  let ready = false;
  let disjoint = false;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    createQuery: () => ({}), beginQuery() {}, endQuery() {}, deleteQuery() {},
    getParameter: () => disjoint,
    getQueryParameter: (_query: unknown, name: number) => name === 1 ? ready : 1_000_000,
  };
  const renderer = { getContext: () => gl, shadowMap: {}, info: { programs: [] }, render() {} };
  const store = { getState: () => ({ internal }) };
  const breakdown = installFrameBreakdown(renderer as never, store as never);
  internal.subscribe({ current: () => renderer.render() }, 0);
  const frame = () => { for (const { ref } of subscribers) ref.current({}, 1 / 60); };
  try {
    frame(); frame();
    expect(breakdown.records()[0]?.gpu).toBeNull();
    ready = true; frame();
    expect(breakdown.records()[0]?.gpu?.["main"]).toBe(1);
    disjoint = true; frame();
    expect(breakdown.records()[2]?.gpu).toBeNull();
  } finally {
    breakdown.dispose();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});

test("draw timing credits each draw's GPU time to its pass and material, never the CPU wait between them", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = { subscribers, subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
    const entry = { ref, priority }; subscribers.push(entry); subscribers.sort((a, b) => a.priority - b.priority);
    return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
  } };
  // A fake GPU clock: each draw costs 1 ms of GPU work, and the CPU's submission between draws
  // leaves the GPU idle for 3 ms, which an open timer counts the way TIME_ELAPSED does.
  let clock = 0;
  const begun = new Map<object, number>();
  const result = new Map<object, number>();
  let open: object | null = null;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    createQuery: () => ({}),
    beginQuery(_target: number, query: object) { if (open !== null) throw new Error("only one timer runs at a time"); open = query; begun.set(query, clock); },
    endQuery() { if (open === null) throw new Error("no timer running"); result.set(open, (clock - (begun.get(open) ?? clock)) * 1e6); open = null; },
    deleteQuery() {},
    getParameter: () => false,
    getQueryParameter: (query: object, name: number) => name === 1 ? result.has(query) : result.get(query),
  };
  const mesh = { name: "Rock", type: "Mesh", id: 1, parent: null };
  const geometry = { type: "BoxGeometry", index: { count: 36 } };
  const material = { name: "Stone", type: "MeshStandardMaterial", id: 7 };
  const renderer = {
    getContext: () => gl, shadowMap: {}, info: { programs: [] },
    renderBufferDirect(_c: unknown, _s: unknown, _g: unknown, _m: unknown, _o: unknown, _gr: unknown) { clock += 1; },
    clear() { clock += 0.5; },
    render() {
      renderer.clear();
      for (let draw = 0; draw < 3; draw += 1) {
        clock += 3; // CPU submission: the GPU idles
        renderer.renderBufferDirect(null, null, geometry, material, mesh, null);
      }
    },
  };
  const store = { getState: () => ({ internal }) };
  const breakdown = installFrameBreakdown(renderer as never, store as never);
  internal.subscribe({ current: () => renderer.render() }, 0);
  const frame = () => { for (const { ref } of subscribers) ref.current({}, 1 / 60); };
  try {
    frame(); frame(); frame();
    expect(breakdown.records()[0]?.gpu?.["main"]).toBe(12.5);
    breakdown.gpuTiming("draws");
    breakdown.reset();
    frame(); frame(); frame();
    const summary = breakdown.summary();
    expect(summary.gpuTiming).toBe("draws");
    expect(breakdown.records()[0]?.gpu?.["main"]).toBe(3.5);
    expect(summary.materials[0]).toMatchObject({ label: "Stone#7", gpuMs: 3 });
    expect(breakdown.gpuTiming("span")).toBe("span");
  } finally {
    breakdown.dispose();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});

test("shared member identities survive the recorder and source-map report", async () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "?frameMembers=1" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = { subscribers, subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
    const entry = { ref, priority }; subscribers.push(entry); subscribers.sort((a, b) => a.priority - b.priority);
    return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
  } };
  const store = { getState: () => ({ internal }) };
  const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {} };
  const first = () => {};
  const second = () => {};
  const leaveFirst = joinFrameGroup(store, internal.subscribe, 0, { current: first });
  const leaveSecond = joinFrameGroup(store, internal.subscribe, 0, { current: second });
  const breakdown = installFrameBreakdown(renderer as never, store as never);
  try {
    for (let i = 0; i < 2; i += 1) for (const { ref } of subscribers) ref.current({}, 1 / 60);
    const callbacks = Object.entries(breakdown.callbacks());
    const firstLabel = callbacks.find(([, callback]) => callback === first)?.[0];
    const secondLabel = callbacks.find(([, callback]) => callback === second)?.[0];
    expect(firstLabel).toBeDefined(); expect(secondLabel).toBeDefined();
    let parsed: (event: Record<string, unknown>) => void = () => {};
    const session = {
      evaluate: async (expression: string) => expression.startsWith("fetch(") ? JSON.stringify({ version: 3, sources: [expression.includes("first.map") ? "first.ts" : "second.ts"], names: [], mappings: "AAAA" }) : breakdown.summary({ top: 100 }),
      on: (_event: string, callback: typeof parsed) => { parsed = callback; return () => {}; },
      send: async (method: string, params?: Record<string, unknown>) => {
        if (method === "Debugger.enable") {
          parsed({ scriptId: "1", url: "http://localhost/packages/core/src/first.ts", sourceMapURL: "first.map" });
          parsed({ scriptId: "2", url: "http://localhost/packages/core/src/second.ts", sourceMapURL: "second.map" });
        }
        if (method === "Runtime.evaluate") {
          const expression = String(params?.["expression"]);
          const id = expression.includes(JSON.stringify(firstLabel)) ? "1" : expression.includes(JSON.stringify(secondLabel)) ? "2" : null;
          return { result: id === null ? {} : { objectId: id } };
        }
        if (method === "Runtime.getProperties") return { internalProperties: [{ name: "[[FunctionLocation]]", value: { value: { scriptId: params?.["objectId"], lineNumber: 0, columnNumber: 0 } } }] };
        return {};
      },
    };
    const summary = await readBreakdown(session as never);
    expect(summary?.calls?.find((row) => row.name.startsWith(`${firstLabel} packages/core/src/first.ts:1`))?.avg).toBe(1);
    expect(summary?.calls?.find((row) => row.name.startsWith(`${secondLabel} packages/core/src/second.ts:1`))?.avg).toBe(1);
  } finally {
    breakdown.dispose(); leaveFirst(); leaveSecond();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});

test("attributes real fauna terrain queries and terrain edits to a shared callback", () => {
  const prior = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { location: { search: "?frameMembers=1" } });
  const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
  const internal = {
    subscribers,
    subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
      const entry = { ref, priority }; subscribers.push(entry); subscribers.sort((a, b) => a.priority - b.priority);
      return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
    },
  };
  const store = { getState: () => ({ internal }) };
  const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {} };
  const terrain = createEditableTerrain({ bounds: { minX: -50, minZ: -50, maxX: 50, maxZ: 50 }, cellSize: 2 });
  const fauna = createAmbientFauna([{ id: "motes", species: "motes", motion: "drift", area: { shape: "disc", x: 0, z: 0, radius: 20 }, count: 20, seed: 1 }], { groundAt: terrain.sampleHeight, groundRevision: terrain.heightRevision });
  const repeated = createAmbientFauna([{ id: "repeat", species: "motes", motion: "drift", area: { shape: "disc", x: 0, z: 0, radius: 20 }, count: 20, seed: 1 }], { groundAt: terrain.sampleHeight });
  let time = 0;
  const advanceFauna = () => { fauna.update({ dt: 1 / 30, time: time += 1 / 30, sunHeight: 1, focusX: 0, focusZ: 0 }); };
  const repeatQueries = () => { repeated.update({ dt: 1 / 30, time, sunHeight: 1, focusX: 0, focusZ: 0 }); };
  const leave = joinFrameGroup(store, internal.subscribe, 0, { current: advanceFauna });
  const leaveRepeated = joinFrameGroup(store, internal.subscribe, 0, { current: repeatQueries });
  const breakdown = installFrameBreakdown(renderer as never, store as never);
  const runFrame = () => { for (const { ref } of subscribers) ref.current({}, 1 / 30); };
  try {
    for (let i = 0; i < 60; i += 1) runFrame();
    const repeatedOwner = Object.entries(breakdown.callbacks()).find(([, callback]) => callback === repeatQueries)?.[0];
    const normalOwner = Object.entries(breakdown.callbacks()).find(([, callback]) => callback === advanceFauna)?.[0];
    const normalFrame = breakdown.records().at(-1);
    expect(normalFrame?.calls?.[`${repeatedOwner} | fauna ground queries`]).toBeGreaterThan(normalFrame?.calls?.[`${normalOwner} | fauna ground queries`] ?? 0);
    expect(normalFrame?.calls?.[`${repeatedOwner} | fauna invalidation: unknown ground revision`]).toBe(1);
    terrain.apply({ mode: "raise", center: [0, 0], radius: 40, strength: 8, falloff: "none" });
    runFrame(); runFrame();
    const labels = Object.entries(breakdown.callbacks());
    const owner = labels.find(([, callback]) => callback === advanceFauna)?.[0];
    expect(owner).toBeDefined();
    const edited = breakdown.records().at(-1);
    expect(edited?.calls?.[`${owner} | fauna updates`]).toBe(1);
    expect(edited?.calls?.[`${owner} | fauna agents`]).toBe(20);
    expect(edited?.calls?.[`${owner} | fauna ground queries`]).toBeGreaterThanOrEqual(20);
    expect(edited?.calls?.[`${owner} | fauna invalidation: ground revision changed`]).toBe(1);
    expect(breakdown.summary({ top: 100 }).calls?.some((entry) => entry.name === `${owner} | fauna ground queries`)).toBe(true);
  } finally {
    breakdown.dispose(); leave(); leaveRepeated();
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});

test("deep observation preserves the same fauna workload and query count", () => {
  const prior = Reflect.get(globalThis, "window");
  const run = (deep: boolean) => {
    Reflect.set(globalThis, "window", { location: { search: deep ? "?frameMembers=1" : "" } });
    const subscribers: { ref: { current: (state: unknown, delta: number) => void }; priority: number }[] = [];
    const internal = { subscribers, subscribe(ref: { current: (state: unknown, delta: number) => void }, priority: number) {
      const entry = { ref, priority }; subscribers.push(entry); subscribers.sort((a, b) => a.priority - b.priority);
      return () => { const index = subscribers.indexOf(entry); if (index >= 0) subscribers.splice(index, 1); };
    } };
    const store = { getState: () => ({ internal }) };
    const renderer = { getContext: () => ({ getExtension: () => null }), shadowMap: {}, info: { programs: [] }, render() {} };
    let queries = 0;
    const fauna = createAmbientFauna([{ id: "motes", species: "motes", motion: "drift", area: { shape: "disc", x: 0, z: 0, radius: 20 }, count: 20, seed: 1 }], { groundAt: () => { queries += 1; return 0; }, groundRevision: () => 0 });
    let time = 0;
    const update = () => fauna.update({ dt: 1 / 30, time: time += 1 / 30, sunHeight: 1, focusX: 0, focusZ: 0 });
    const leave = joinFrameGroup(store, internal.subscribe, 0, { current: update });
    const breakdown = installFrameBreakdown(renderer as never, store as never);
    try {
      queries = 0;
      for (let i = 0; i < 60; i += 1) for (const { ref } of subscribers) ref.current({}, 1 / 30);
      const completedQueries = queries;
      for (const { ref } of subscribers) ref.current({}, 1 / 30);
      const owner = Object.entries(breakdown.callbacks()).find(([, callback]) => callback === update)?.[0];
      const counted = breakdown.records().reduce((sum, record) => sum + (record.calls?.[`${owner} | fauna ground queries`] ?? 0), 0);
      return { snapshot: fauna.snapshot(), queries, completedQueries, counted, owner };
    } finally { breakdown.dispose(); leave(); }
  };
  try {
    const normal = run(false);
    const deep = run(true);
    expect(deep.snapshot).toEqual(normal.snapshot);
    expect(deep.queries).toBe(normal.queries);
    expect(deep.owner).toBeDefined();
    expect(deep.counted).toBeGreaterThan(0);
    expect(deep.counted).toBe(deep.completedQueries);
  } finally {
    if (prior === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", prior);
  }
});
