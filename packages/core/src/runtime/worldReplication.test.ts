import { describe, expect, test } from "bun:test";
import {
  applyWorldDiff,
  createWorldReplicator,
  diffSnapshots,
} from "@jgengine/core/runtime/worldReplication";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";

function ent(id: string, x: number): unknown {
  return { id, position: [x, 0, 0] };
}

describe("world replicator", () => {
  test("first commit stamps everything at revision 1 and diff(0) returns the full world", () => {
    const state: WorldSnapshot = {
      entities: [ent("e1", 1)],
      stats: { e1: { health: { current: 5, max: 5, min: 0 } } },
      store: [["phase", "combat"]],
      feed: { "entity.died": [] },
    };
    const rep = createWorldReplicator(() => state);
    expect(rep.commit()).toBe(1);

    const diff = rep.diff(0);
    expect(diff.revision).toBe(1);
    expect(diff.entities).toEqual([ent("e1", 1)]);
    expect(diff.stats).toEqual({ e1: { health: { current: 5, max: 5, min: 0 } } });
    expect(diff.store).toEqual([["phase", "combat"]]);
    expect(diff.modules).toEqual({ feed: { "entity.died": [] } });
  });

  test("an unchanged commit does not bump the revision", () => {
    const state: WorldSnapshot = { entities: [ent("e1", 1)], stats: {}, store: [] };
    const rep = createWorldReplicator(() => state);
    expect(rep.commit()).toBe(1);
    expect(rep.commit()).toBe(1);
    expect(rep.diff(1).entities).toEqual([]);
  });

  test("diff(sinceRevision) carries only items changed after that revision", () => {
    let state: WorldSnapshot = { entities: [ent("e1", 1), ent("e2", 2)], stats: {}, store: [] };
    const rep = createWorldReplicator(() => state);
    rep.commit();

    state = { entities: [ent("e1", 9), ent("e2", 2)], stats: {}, store: [] };
    expect(rep.commit()).toBe(2);

    const diff = rep.diff(1);
    expect(diff.entities).toEqual([ent("e1", 9)]);
    expect(rep.diff(0).entities).toHaveLength(2);
  });

  test("removals surface in the removed* lists gated by revision", () => {
    let state: WorldSnapshot = {
      entities: [ent("e1", 1)],
      stats: { e1: { health: { current: 5, max: 5, min: 0 } } },
      store: [["a", 1]],
    };
    const rep = createWorldReplicator(() => state);
    rep.commit();

    state = { entities: [], stats: {}, store: [] };
    expect(rep.commit()).toBe(2);

    const diff = rep.diff(1);
    expect(diff.removedEntities).toEqual(["e1"]);
    expect(diff.removedStats).toEqual(["e1"]);
    expect(diff.removedStore).toEqual(["a"]);
    expect(rep.diff(2).removedEntities).toEqual([]);
  });

  test("a module that disappears surfaces in removedModules gated by revision", () => {
    let state: WorldSnapshot = {
      entities: [],
      stats: {},
      store: [],
      feed: { "entity.died": [] },
      leaderboard: { top: [] },
    };
    const rep = createWorldReplicator(() => state);
    rep.commit();

    state = { entities: [], stats: {}, store: [], leaderboard: { top: [] } };
    expect(rep.commit()).toBe(2);

    const diff = rep.diff(1);
    expect(diff.removedModules).toEqual(["feed"]);
    expect(diff.modules).toEqual({});
    expect(rep.diff(2).removedModules).toEqual([]);
  });

  test("diff() stamps baseRevision to the requested sinceRevision", () => {
    const state: WorldSnapshot = { entities: [], stats: {}, store: [] };
    const rep = createWorldReplicator(() => state);
    rep.commit();
    expect(rep.diff(0).baseRevision).toBe(0);
    expect(rep.diff(1).baseRevision).toBe(1);
  });

  test("applyWorldDiff folds a diff onto a baseline into the next full snapshot", () => {
    let state: WorldSnapshot = {
      entities: [ent("e1", 1), ent("e2", 2)],
      stats: { e1: { hp: { current: 3, max: 3, min: 0 } } },
      store: [["phase", "lobby"]],
      feed: { chat: ["hi"] },
    };
    const rep = createWorldReplicator(() => state);
    rep.commit();
    const baseline = structuredClone(state);
    const baselineRevision = rep.revision();

    state = {
      entities: [ent("e1", 42)],
      stats: { e1: { hp: { current: 1, max: 3, min: 0 } } },
      store: [["phase", "combat"]],
      feed: { chat: ["hi", "gg"] },
    };
    rep.commit();

    const rebuilt = applyWorldDiff(baseline, rep.diff(baselineRevision));
    const rebuiltEntities = new Map((rebuilt["entities"] as { id: string }[]).map((e) => [e.id, e]));
    expect(rebuiltEntities.get("e1")).toEqual(ent("e1", 42) as { id: string });
    expect(rebuiltEntities.has("e2")).toBe(false);
    expect(rebuilt["stats"]).toEqual({ e1: { hp: { current: 1, max: 3, min: 0 } } });
    expect(new Map(rebuilt["store"] as [string, unknown][])).toEqual(new Map([["phase", "combat"]]));
    expect(rebuilt["feed"]).toEqual({ chat: ["hi", "gg"] });
  });

  test("applyWorldDiff drops a module named in removedModules", () => {
    const baseline: WorldSnapshot = {
      entities: [],
      stats: {},
      store: [],
      feed: { chat: ["hi"] },
      leaderboard: { top: [] },
    };
    let state: WorldSnapshot = structuredClone(baseline);
    const rep = createWorldReplicator(() => state);
    const baselineRevision = rep.commit();

    state = { entities: [], stats: {}, store: [], leaderboard: { top: [] } };
    rep.commit();

    const rebuilt = applyWorldDiff(baseline, rep.diff(baselineRevision));
    expect(rebuilt["feed"]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(rebuilt, "feed")).toBe(false);
    expect(rebuilt["leaderboard"]).toEqual({ top: [] });
  });

  test("diffSnapshots diffs two baselines and applyWorldDiff reproduces the next one", () => {
    const prev: WorldSnapshot = {
      entities: [ent("e1", 1), ent("e2", 2)],
      stats: { e1: { hp: { current: 3, max: 3, min: 0 } } },
      store: [["a", 1]],
      feed: { log: [] },
    };
    const next: WorldSnapshot = {
      entities: [ent("e1", 7)],
      stats: { e1: { hp: { current: 2, max: 3, min: 0 } } },
      store: [["a", 1], ["b", 2]],
      feed: { log: ["x"] },
    };

    const diff = diffSnapshots(prev, next, 5);
    expect(diff.revision).toBe(5);
    expect(diff.baseRevision).toBeUndefined();
    expect(diff.entities).toEqual([ent("e1", 7)]);
    expect(diff.removedEntities).toEqual(["e2"]);
    expect(diff.store).toEqual([["b", 2]]);
    expect(diff.modules).toEqual({ feed: { log: ["x"] } });
    expect(diff.removedModules).toEqual([]);

    const rebuilt = applyWorldDiff(prev, diff);
    expect(new Map((rebuilt["entities"] as { id: string }[]).map((e) => [e.id, e]))).toEqual(
      new Map((next["entities"] as { id: string }[]).map((e) => [e.id, e])),
    );
    expect(rebuilt["stats"]).toEqual(next["stats"]);
    expect(new Map(rebuilt["store"] as [string, unknown][])).toEqual(
      new Map(next["store"] as [string, unknown][]),
    );
    expect(rebuilt["feed"]).toEqual(next["feed"]);
  });

  test("diffSnapshots surfaces a dropped module in removedModules and accepts an explicit baseRevision", () => {
    const prev: WorldSnapshot = { entities: [], stats: {}, store: [], feed: { log: [] } };
    const next: WorldSnapshot = { entities: [], stats: {}, store: [] };

    const diff = diffSnapshots(prev, next, 6, 5);
    expect(diff.baseRevision).toBe(5);
    expect(diff.removedModules).toEqual(["feed"]);

    const rebuilt = applyWorldDiff(prev, diff);
    expect(rebuilt["feed"]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(rebuilt, "feed")).toBe(false);
  });
});
