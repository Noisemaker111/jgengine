import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import { createResourceNodeField, type ResourceNodeDef } from "./resourceNode";

const rock = (): ResourceNodeDef => ({
  id: "rock",
  budget: 4,
  respawn: 10,
  resources: [
    { kind: "stone", amount: 3 },
    { kind: "ore", amount: 1 },
  ],
});

describe("createResourceNodeField", () => {
  test("tool biases decide which resources one node returns", () => {
    const field = createResourceNodeField({ nodes: [rock()] });

    // A pick favors ore, ignores stone.
    const pick = field.harvest("rock", { biases: { stone: 0, ore: 2 } });
    expect(pick.granted).toEqual([{ kind: "ore", amount: 2 }]);

    // A hatchet over the SAME node kind favors stone.
    const field2 = createResourceNodeField({ nodes: [rock()] });
    const hatchet = field2.harvest("rock", { biases: { stone: 1, ore: 0 } });
    expect(hatchet.granted).toEqual([{ kind: "stone", amount: 3 }]);
  });

  test("default bias applies to unlisted kinds", () => {
    const field = createResourceNodeField({ nodes: [rock()] });
    const result = field.harvest("rock", { biases: { ore: 5 }, defaultBias: 1 });
    expect(result.granted).toEqual([
      { kind: "stone", amount: 3 },
      { kind: "ore", amount: 5 },
    ]);
  });

  test("harvester multiplier scales every grant", () => {
    const field = createResourceNodeField({ nodes: [rock()] });
    const result = field.harvest("rock", {}, { multiplier: 2 });
    expect(result.granted).toEqual([
      { kind: "stone", amount: 6 },
      { kind: "ore", amount: 2 },
    ]);
  });

  test("budget depletes and each hit spends the tool's power", () => {
    const field = createResourceNodeField({ nodes: [rock()] });

    const first = field.harvest("rock", { power: 3 });
    expect(first.spent).toBe(3);
    expect(first.depleted).toBe(false);
    expect(field.state("rock").budget).toBe(1);

    const second = field.harvest("rock", { power: 3 });
    expect(second.spent).toBe(1); // clamped to remaining budget
    expect(second.depleted).toBe(true);
    expect(field.isDepleted("rock")).toBe(true);
    expect(field.state("rock").fraction).toBe(0);

    // A depleted node yields nothing and spends nothing.
    const third = field.harvest("rock", { power: 3 });
    expect(third).toEqual({ nodeId: "rock", granted: [], spent: 0, harvested: false, depleted: true });
  });

  test("respawn refills the node after the delay elapses", () => {
    const field = createResourceNodeField({ nodes: [rock()] });
    field.harvest("rock", { power: 4 });
    expect(field.isDepleted("rock")).toBe(true);

    field.tick(6);
    expect(field.isDepleted("rock")).toBe(true); // timer not yet elapsed

    field.tick(4);
    expect(field.isDepleted("rock")).toBe(false);
    expect(field.state("rock").budget).toBe(4);
    expect(field.state("rock").fraction).toBe(1);
  });

  test("respawnBudget refills to a different amount than the starting budget", () => {
    const field = createResourceNodeField({
      nodes: [{ id: "bush", budget: 5, respawn: 2, respawnBudget: 2, resources: [{ kind: "berry", amount: 1 }] }],
    });
    field.harvest("bush", { power: 5 });
    field.tick(2);
    expect(field.state("bush").budget).toBe(2);
    expect(field.state("bush").maxBudget).toBe(5);
  });

  test("a node with no respawn stays depleted forever", () => {
    const field = createResourceNodeField({
      nodes: [{ id: "deposit", budget: 1, resources: [{ kind: "crystal", amount: 1 }] }],
    });
    field.harvest("deposit", {});
    field.tick(1000);
    expect(field.isDepleted("deposit")).toBe(true);
  });

  test("the per-node flag suppresses respawn", () => {
    const field = createResourceNodeField({ nodes: [rock()] });
    field.harvest("rock", { power: 4 });
    field.setRespawnBlocked("rock", true);

    field.tick(100);
    expect(field.isDepleted("rock")).toBe(true);
    expect(field.state("rock").respawnTimer).toBe(10); // frozen, not counted down

    field.setRespawnBlocked("rock", false);
    field.tick(10);
    expect(field.isDepleted("rock")).toBe(false);
  });

  test("the injected suppression predicate blocks respawn", () => {
    let occupied = true;
    const field = createResourceNodeField({
      nodes: [rock()],
      respawnSuppressed: (state) => state.id === "rock" && occupied,
    });
    field.harvest("rock", { power: 4 });

    field.tick(100);
    expect(field.isDepleted("rock")).toBe(true);

    occupied = false;
    field.tick(10);
    expect(field.isDepleted("rock")).toBe(false);
  });

  test("seeded rng gives deterministic variance and repeats exactly", () => {
    const make = () =>
      createResourceNodeField({
        nodes: [{ id: "tree", budget: 10, resources: [{ kind: "wood", amount: [1, 5] }] }],
        rng: seededRng("harvest-seed"),
      });

    const runA = [make().harvest("tree", {}), make().harvest("tree", {})];
    const first = make().harvest("tree", {}).granted[0]!.amount;
    const firstAgain = make().harvest("tree", {}).granted[0]!.amount;

    expect(first).toBe(firstAgain);
    expect(runA[0]!.granted[0]!.amount).toBe(first);
    // Value lands inside the configured range.
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThan(5);
  });

  test("state round-trips through JSON via snapshot/hydrate", () => {
    const field = createResourceNodeField({ nodes: [rock()] });
    field.harvest("rock", { power: 3 });
    field.setRespawnBlocked("rock", true);

    const snapshot = field.snapshot();
    const restored = JSON.parse(JSON.stringify(snapshot));
    expect(restored).toEqual(snapshot);

    const rebuilt = createResourceNodeField({ nodes: [rock()] });
    rebuilt.hydrate(restored);
    expect(rebuilt.snapshot()).toEqual(snapshot);
    expect(rebuilt.state("rock").budget).toBe(1);
    expect(rebuilt.state("rock").respawnBlocked).toBe(true);
  });

  test("unknown node id throws", () => {
    const field = createResourceNodeField({ nodes: [rock()] });
    expect(() => field.state("nope")).toThrow();
  });

  test("duplicate node id throws", () => {
    expect(() => createResourceNodeField({ nodes: [rock(), rock()] })).toThrow();
  });
});
