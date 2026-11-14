import { describe, expect, test } from "bun:test";
import { NIGHTS, nightOf, planRoom, ROOT, depthOf, parentOf, threatChance, type RunSeed } from "./runGen";
import { ROOM_TEMPLATES, walkable } from "../world";
import { ITEMS } from "./loot";

const night = (seed: string, extra: Partial<RunSeed> = {}): RunSeed => ({ seed, little: "pip", zones: ["kitchen", "living"], ...extra });
const ALL = { zones: ["kitchen", "living", "kidroom", "garage", "attic"] } as const;

describe("the procedural house", () => {
  test("a seed always builds the same rooms, and different seeds build different nights", () => {
    const a = planRoom(night("night-1-1"), "0-1-0"), b = planRoom(night("night-1-1"), "0-1-0");
    expect(a.template.id).toBe(b.template.id);
    expect(a.loot.map(l => `${l.key}:${l.kind}:${l.level}`)).toEqual(b.loot.map(l => `${l.key}:${l.kind}:${l.level}`));
    const layouts = new Set(Array.from({ length: 24 }, (_, i) => {
      const run = night(`night-${i}-0`);
      return [ROOT, "0-0", "0-1", "0-0-0"].map(p => planRoom(run, p).template.id).join(">");
    }));
    expect(layouts.size).toBeGreaterThan(6);
  });
  test("every run starts at a baseboard room with the crack home, and goes on room after room", () => {
    for (let i = 0; i < 30; i++) {
      const run = night(`n${i}`);
      const root = planRoom(run, ROOT);
      expect(root.template.root).toBe(true);
      expect(root.exits.some(e => e.kind === "crack")).toBe(true);
      let path = ROOT;
      for (let d = 1; d <= 5; d++) {
        const room = planRoom(run, path);
        expect(room.forwards.length).toBeGreaterThan(0);
        path = room.forwards[i % room.forwards.length]!.to;
        const next = planRoom(run, path);
        expect(next.depth).toBe(d);
        expect(next.template.minDepth).toBeLessThanOrEqual(d);
        expect(["kitchen", "living"]).toContain(next.template.zone);
        expect(next.exits.some(e => e.kind === "crack")).toBe(false);
      }
    }
    expect(depthOf("0-1-0")).toBe(2);
    expect(parentOf("0-1-0")).toBe("0-1");
  });
  test("deeper rooms roll higher-level loot and more hunters", () => {
    let shallow = 0, deep = 0, shallowThreats = 0, deepThreats = 0;
    for (let i = 0; i < 40; i++) {
      const run = night(`d${i}`, ALL);
      const near = planRoom(run, "0-0"), far = planRoom(run, "0-0-0-0-0-0");
      shallow += near.loot.reduce((s, l) => s + l.level, 0) / Math.max(1, near.loot.length);
      deep += far.loot.reduce((s, l) => s + l.level, 0) / Math.max(1, far.loot.length);
      shallowThreats += near.threats.length; deepThreats += far.threats.length;
    }
    expect(deep).toBeGreaterThan(shallow * 2);
    expect(deepThreats).toBeGreaterThan(shallowThreats);
    expect(threatChance("cat", 0, 0)).toBeLessThan(threatChance("cat", 4, 0));
  });
  test("charted zones open new rooms deeper in; uncharted ones never appear", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const run = night(`z${i}`, ALL);
      for (const p of ["0-0-0-0", "0-1-0-0", "0-0-1-0-0", "0-1-1-1-0", "0-0-0-0-0-0"]) seen.add(planRoom(run, p).template.zone);
    }
    expect([...seen].sort()).toEqual(["attic", "garage", "kidroom", "kitchen", "living"]);
  });
  test("Pip smells an extra bite in the rooms", () => {
    let pipFood = 0, boltFood = 0;
    const food = (kind: string) => kind !== "toybox" && ITEMS[kind as keyof typeof ITEMS].category === "food";
    for (let i = 0; i < 30; i++) {
      pipFood += planRoom(night(`f${i}`), "0-0").loot.filter(l => food(l.kind)).length;
      boltFood += planRoom(night(`f${i}`, { little: "bolt" }), "0-0").loot.filter(l => food(l.kind)).length;
    }
    expect(pipFood).toBeGreaterThan(boltFood);
  });
  test("every night rolls a kind of night, the first is quiet, and the family being away keeps the kid out of bed", () => {
    expect(nightOf("night-1-0")).toBe("quiet");
    const kinds = new Set(Array.from({ length: 80 }, (_, i) => nightOf(`night-${i + 2}-${i}`)));
    expect(kinds.size).toBe(Object.keys(NIGHTS).length);
    const away = Array.from({ length: 400 }, (_, i) => `night-${i + 2}-${i}`).find(seed => nightOf(seed) === "away")!;
    for (const path of ["0-0-0", "0-1-0-0", "0-0-1-1", "0-1-1-0-0"]) expect(planRoom(night(away, ALL), path).threats.some(t => t.kind === "kid")).toBe(false);
  });
  test("every authored door, spot and exit stands on walkable floor", () => {
    for (const t of ROOM_TEMPLATES) {
      for (const d of t.doors) expect(walkable(t, d.at[0], d.at[2]), `${t.id} ${d.id}`).toBe(true);
      for (const s of t.spots) expect(walkable(t, s.at[0], s.at[2]), `${t.id} ${s.id}`).toBe(true);
      for (const e of t.exits) expect(walkable(t, e.at[0], e.at[2]), `${t.id} ${e.id}`).toBe(true);
    }
  });
});
