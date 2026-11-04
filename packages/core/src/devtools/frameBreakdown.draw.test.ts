import { expect, test } from "bun:test";

import { joinFrameGroup } from "../render/useSharedFrame.draw";
import { createAmbientFauna } from "../ambientFauna/ambientFauna";
import { createEditableTerrain } from "../terrain/terraform";
import { readBreakdown } from "../../../../scripts/perf-breakdown";
import { installFrameBreakdown } from "./frameBreakdown.draw";

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
