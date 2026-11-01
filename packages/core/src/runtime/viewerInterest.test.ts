import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import type { SceneEntity } from "../scene/entityStore";
import type { GameContext, GameContextContent } from "./gameContext";
import { createHostedWorldSession } from "./hostedWorldSession";
import { applyWorldDiff, createWorldViewState } from "./worldReplication";
import type { WorldSnapshot } from "./worldSnapshot";

const CONTENT: GameContextContent = { entityById: () => ({ stats: { health: { max: 10 } } }) };

function session(replication: { aoiRadius?: number; aoiAlways?: readonly string[] }) {
  const definition = defineGameDefinition({
    name: "Interest",
    assets: createAssetCatalog(),
    multiplayer: "off",
    features: { players: true },
    replication,
    loop: {
      onNewPlayer(ctx: GameContext, player) {
        // type-escape: test and probe code reads untyped frames
        ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
      },
    },
  });
  return createHostedWorldSession({ definition, content: CONTENT });
}

type Viewer = { userId: string };

function follow(world: ReturnType<typeof session>, viewer: Viewer) {
  const state = createWorldViewState();
  let mirror: WorldSnapshot = {};
  let revision: number | null = null;
  return {
    state,
    pull() {
      const sync = world.pullFor(viewer, revision, state);
      if (sync.kind === "baseline") mirror = sync.snapshot;
      else mirror = applyWorldDiff(mirror, sync.diff);
      revision = sync.kind === "baseline" ? sync.revision : sync.diff.revision;
    },
    // type-escape: test and probe code reads untyped frames
    ids: () => ((mirror["entities"] ?? []) as SceneEntity[]).map((e) => e.id).sort(),
    // type-escape: test and probe code reads untyped frames
    entities: () => (mirror["entities"] ?? []) as SceneEntity[],
  };
}

function expectedIds(world: ReturnType<typeof session>, viewer: Viewer): string[] {
  // type-escape: test and probe code reads untyped frames
  return ((world.snapshotFor(viewer)["entities"] ?? []) as SceneEntity[]).map((e) => e.id).sort();
}

describe("per-viewer interest diffs", () => {
  test("a mirror fed by pullFor always equals the projected baseline as entities move in and out of range", () => {
    const world = session({ aoiRadius: 10, aoiAlways: ["boss"] });
    world.join("alice", true);
    world.join("bob", true);
    const ctx = world.runner().context();
    ctx.scene.entity.spawn("hero", { id: "boss", position: [500, 0, 500] });
    ctx.scene.entity.spawn("hero", { id: "near", position: [3, 0, 0] });
    ctx.scene.entity.spawn("hero", { id: "far", position: [80, 0, 0] });
    ctx.scene.entity.setPose("bob", { position: [200, 0, 0] });
    world.tick(0.05);
    const alice = follow(world, { userId: "alice" });
    const bob = follow(world, { userId: "bob" });
    alice.pull();
    bob.pull();
    expect(alice.ids()).toEqual(["alice", "boss", "near"]);
    expect(bob.ids()).toEqual(["bob", "boss"]);

    const script: (() => void)[] = [
      () => ctx.scene.entity.setPose("far", { position: [8, 0, 0] }),
      () => ctx.scene.entity.setPose("near", { position: [40, 0, 0] }),
      () => ctx.scene.entity.setPose("bob", { position: [8, 0, 1] }),
      () => ctx.scene.entity.despawn("far"),
      () => ctx.scene.entity.spawn("hero", { id: "late", position: [1, 0, 1] }),
      () => ctx.scene.entity.setPose("alice", { position: [-300, 0, 0] }),
      () => ctx.scene.entity.setPose("alice", { position: [41, 0, 0] }),
    ];
    for (const step of script) {
      step();
      world.tick(0.05);
      alice.pull();
      bob.pull();
      expect(alice.ids()).toEqual(expectedIds(world, { userId: "alice" }));
      expect(bob.ids()).toEqual(expectedIds(world, { userId: "bob" }));
    }
  });

  test("a diff carries only entities that changed or entered range, never the whole world", () => {
    const world = session({ aoiRadius: 10 });
    world.join("alice", true);
    const ctx = world.runner().context();
    for (let i = 0; i < 50; i += 1) ctx.scene.entity.spawn("hero", { id: `n${i}`, position: [i * 4, 0, 0] });
    world.tick(0.05);
    const state = createWorldViewState();
    const first = world.pullFor({ userId: "alice" }, null, state);
    expect(first.kind).toBe("baseline");
    ctx.scene.entity.setPose("n1", { position: [4.5, 0, 0] });
    ctx.scene.entity.setPose("n40", { position: [160.5, 0, 0] });
    world.tick(0.05);
    const second = world.pullFor({ userId: "alice" }, world.revision() - 1, state);
    if (second.kind !== "diff") throw new Error("expected a diff");
    expect(second.diff.entities.map((e) => e.id)).toEqual(["n1"]);
  });

  test("without a radius there is no interest set", () => {
    const world = session({});
    world.join("alice", true);
    const ctx = world.runner().context();
    ctx.scene.entity.spawn("hero", { id: "far", position: [9000, 0, 0] });
    world.tick(0.05);
    expect(world.runner().context().interestOf({ userId: "alice" })).toBeNull();
  });

  test("a viewer with no entity yet holds everything, then narrows once it spawns", () => {
    const world = session({ aoiRadius: 5 });
    world.join("alice", true);
    const ctx = world.runner().context();
    ctx.scene.entity.spawn("hero", { id: "far", position: [900, 0, 0] });
    world.tick(0.05);
    const ghost = follow(world, { userId: "ghost" });
    ghost.pull();
    expect(ghost.ids()).toContain("far");
    ctx.scene.entity.spawn("hero", { id: "ghost", position: [0, 0, 0] });
    world.tick(0.05);
    ghost.pull();
    expect(ghost.ids()).toEqual(expectedIds(world, { userId: "ghost" }));
    expect(ghost.ids()).not.toContain("far");
  });
});
