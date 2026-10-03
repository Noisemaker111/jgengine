import { expect, test } from "bun:test";
import { createSpatialApi } from "./spatial";
import type { EntityPosition } from "./entityStore";

test("5000 entities: warm miss and one moving match enumerate no candidates", () => {
  const positions = new Map<string, EntityPosition>();
  for (let i = 0; i < 5000; i++) positions.set(`e${i}`, [1000 + i * 16, 0, 1000]);
  let visits = 0;
  let reads = 0;
  const ids = [...positions.keys()];
  ids[Symbol.iterator] = function* () { for (let i = 0; i < this.length; i++) { visits++; yield this[i]!; } };
  const api = createSpatialApi({ incremental: true, candidates: () => ids,
    resolvePosition: (id) => { reads++; return positions.get(id); } });
  expect(api.inRadius([0, 0, 0], 3)).toEqual([]);
  expect(reads).toBe(5000);
  expect(visits).toBeLessThanOrEqual(10000);
  visits = reads = 0;
  expect(api.inRadius([0, 0, 0], 3)).toEqual([]);
  expect([visits, reads]).toEqual([0, 0]);
  positions.set("e0", [1, 0, 1]);
  api.updateEntity("e0");
  expect(api.inRadius([0, 0, 0], 3)).toEqual(["e0"]);
  expect([visits, reads]).toEqual([0, 2]);
  visits = reads = 0;
  for (let i = 0; i < 1000; i++) {
    positions.set("e0", [i * 8, 0, 0]);
    api.updateEntity("e0");
  }
  expect(api.inRadius([7992, 0, 0], 1)).toEqual(["e0"]);
  expect([visits, reads]).toEqual([0, 1001]);
});

test("incremental cells preserve rebuilt order, radius/arc boundaries and filters", () => {
  const positions = new Map<string, EntityPosition>([["a", [20, 0, 0]], ["b", [1, 0, 1]], ["c", [2, 0, 1]]]);
  const opts = { candidates: () => [...positions.keys()], resolvePosition: (id: string) => positions.get(id), grid: { cellSize: 8 } };
  const incremental = createSpatialApi({ ...opts, incremental: true });
  const rebuilt = createSpatialApi(opts);
  incremental.inRadius([0, 0, 0], 50);
  function compare() {
    rebuilt.invalidate();
    for (const center of [[0, 0, 0], [-8, 0, -8], [8, 0, 8]] as const) {
      for (const radius of [0, 1, 8, 50]) {
        expect(incremental.inRadius(center, radius)).toEqual(rebuilt.inRadius(center, radius));
        expect(incremental.inRadius(center, radius, (id) => id !== "b")).toEqual(rebuilt.inRadius(center, radius, (id) => id !== "b"));
      }
    }
    const arc = { from: "b", aim: { yaw: 0, pitch: 0 }, radius: 50, halfAngleDeg: 90 };
    expect(incremental.queryArc(arc)).toEqual(rebuilt.queryArc(arc));
  }
  for (const position of [[0, 0, 1], [-8, 0, -8], [8, 30, 8], [1, 0, 1]] as const) {
    positions.set("a", position); incremental.updateEntity("a"); compare();
  }
  positions.delete("a"); incremental.updateEntity("a"); compare();
  positions.set("a", [1, 0, 1]); incremental.updateEntity("a"); compare();
  expect(incremental.inRadius([0, 0, 0], 5)).toEqual(["b", "c", "a"]);
});

test("initially unresolved positions remain a fallback proportional to their count", () => {
  const positions = new Map<string, EntityPosition>([["known", [100, 0, 100]]]);
  let reads = 0;
  const api = createSpatialApi({ incremental: true, candidates: () => ["known", "late"],
    resolvePosition: (id) => { reads++; return positions.get(id); } });
  api.inRadius([0, 0, 0], 2);
  reads = 0;
  positions.set("late", [1, 0, 0]);
  expect(api.inRadius([0, 0, 0], 2)).toEqual(["late"]);
  expect(reads).toBe(1);
  api.updateEntity("late");
  positions.delete("late"); api.updateEntity("late");
  reads = 0;
  expect(api.inRadius([0, 0, 0], 2)).toEqual([]);
  expect(reads).toBe(0);
});

test("membership bursts defer one rebuild, explicit version/invalidate still work", () => {
  const positions = new Map<string, EntityPosition>([["first", [0, 0, 0]]]);
  let enumerations = 0;
  let version = 0;
  const api = createSpatialApi({ incremental: true, getVersion: () => version,
    candidates: () => { enumerations++; return [...positions.keys()]; }, resolvePosition: (id) => positions.get(id) });
  api.inRadius([0, 0, 0], 1);
  for (let i = 0; i < 300; i++) { const id = `new${i}`; positions.set(id, [100, 0, 100]); api.updateEntity(id); }
  expect(enumerations).toBe(1);
  api.inRadius([0, 0, 0], 1); api.inRadius([0, 0, 0], 1);
  expect(enumerations).toBe(2);
  positions.set("first", [100, 0, 100]); version++;
  expect(api.inRadius([0, 0, 0], 1)).toEqual([]);
  positions.set("first", [0, 0, 0]); api.invalidate();
  expect(api.inRadius([0, 0, 0], 1)).toEqual(["first"]);
  expect(enumerations).toBe(4);
});

test("grid-disabled APIs retain linear discovery with updateEntity as a no-op", () => {
  const positions = new Map<string, EntityPosition>([["a", [100, 0, 0]]]);
  const api = createSpatialApi({ grid: false, incremental: true, candidates: () => [...positions.keys()], resolvePosition: id => positions.get(id) });
  expect(api.inRadius([0, 0, 0], 1)).toEqual([]);
  positions.set("b", [0, 0, 0]); positions.set("a", [1, 0, 0]); api.updateEntity("a");
  expect(api.inRadius([0, 0, 0], 1)).toEqual(["a", "b"]);
});

test("subset membership is authoritative even with positions outside the candidate set", () => {
  const positions = new Map<string, EntityPosition>([["a", [0, 0, 0]], ["b", [1, 0, 0]], ["outside", [0, 0, 0]]]);
  const members = new Set(["a", "b"]);
  let reads = 0;
  let enumerations = 0;
  const api = createSpatialApi({ incremental: true,
    candidates: () => { enumerations++; return [...members]; },
    resolvePosition: id => { reads++; return positions.get(id); } });
  expect(api.inRadius([0, 0, 0], 2)).toEqual(["a", "b"]);
  reads = enumerations = 0;
  members.delete("a");
  api.updateEntity("a", false);
  const removalReads = reads;
  expect(api.inRadius([0, 0, 0], 2)).toEqual(["b"]);
  expect(removalReads).toBe(0);
  api.updateEntity("outside", false);
  expect(api.inRadius([0, 0, 0], 2)).toEqual(["b"]);
  members.add("a"); api.updateEntity("a", true);
  expect(api.inRadius([0, 0, 0], 2)).toEqual(["b", "a"]);
  expect(enumerations).toBe(0);
});

test("explicitly present unresolved candidates retain their bounded late-position fallback", () => {
  const positions = new Map<string, EntityPosition>([["a", [0, 0, 0]]]);
  const members = new Set(["a"]);
  const api = createSpatialApi({ incremental: true, candidates: () => [...members], resolvePosition: id => positions.get(id) });
  api.inRadius([0, 0, 0], 2);
  members.add("late"); api.updateEntity("late", true);
  positions.set("late", [1, 0, 0]);
  expect(api.inRadius([0, 0, 0], 2)).toEqual(["a", "late"]);
  api.updateEntity("late", true);
  positions.delete("a"); api.updateEntity("a", true);
  positions.set("a", [0, 0, 0]); api.updateEntity("a", true);
  expect(api.inRadius([0, 0, 0], 2)).toEqual(["a", "late"]);
  members.delete("late"); api.updateEntity("late", false);
  expect(api.inRadius([0, 0, 0], 2)).toEqual(["a"]);
});

test("explicitly absent IDs cannot enter a subset just because their position resolves", () => {
  const api = createSpatialApi({ incremental: true, candidates: () => [], resolvePosition: () => [0, 0, 0] });
  api.inRadius([0, 0, 0], 1);
  api.updateEntity("outside", false);
  expect(api.inRadius([0, 0, 0], 1)).toEqual([]);
});
