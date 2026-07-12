import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { applyWorldDiff } from "./worldReplication";
import { createHostedGameRunner, type HostedGameRunner } from "./hostedGameRunner";
import type { GameContext, GameContextContent } from "./gameContext";
import type { WorldSnapshot } from "./worldSnapshot";

const CONTENT: GameContextContent = {
  entityById(catalogId) {
    if (catalogId === "hero") return { stats: { health: { max: 10 } } };
    if (catalogId === "mover") return {};
    return null;
  },
};

function runner(restore?: WorldSnapshot): HostedGameRunner {
  return createHostedGameRunner({
    ...(restore === undefined ? {} : { restore }),
    definition: defineGame({
      name: "Hosted",
      assets: createAssetCatalog(),
      multiplayer: "off",
      loop: {
        onInit(ctx: GameContext) {
          ctx.scene.entity.spawn("mover", { id: "mover", position: [0, 0, 0] });
          ctx.game.store.set("started", true);
          ctx.game.commands.define<{ by: number }>("bump", {
            apply(state, input) {
              const prev = (state.game.store.get("bumped") as number | undefined) ?? 0;
              state.game.store.set("bumped", prev + input.by);
            },
          });
        },
        onNewPlayer(ctx: GameContext, player) {
          ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
          ctx.game.store.set("lastJoin", player!.userId);
        },
        onTick(ctx: GameContext, dt) {
          const mover = ctx.scene.entity.get("mover");
          if (mover) ctx.scene.entity.setPose("mover", { position: [mover.position[0] + dt, 0, 0] });
        },
        onPlayerLeave(ctx: GameContext, player) {
          ctx.scene.entity.despawn(player.userId);
        },
      },
    }),
    content: CONTENT,
  });
}

describe("hosted game runner", () => {
  test("onInit runs once at construction", () => {
    const host = runner();
    expect(host.context().game.store.get("started")).toBe(true);
    expect(host.context().scene.entity.get("mover")).not.toBeNull();
  });

  test("join spawns the player's entity, passes identity to onNewPlayer, and tracks membership", () => {
    const host = runner();
    host.join("alice", true);
    expect(host.members()).toEqual(["alice"]);
    expect(host.context().scene.entity.get("alice")).not.toBeNull();
    expect(host.context().game.store.get("lastJoin")).toBe("alice");
  });

  test("tick advances onTick and commits a rising revision", () => {
    const host = runner();
    expect(host.tick(1)).toBe(1);
    expect(host.context().scene.entity.get("mover")?.position[0]).toBeCloseTo(1);
    expect(host.tick(1)).toBe(2);
  });

  test("commands mutate the shared context and surface in the next diff", () => {
    const host = runner();
    host.tick(1);
    const rev = host.revision();
    host.command("alice", "bump", { by: 3 });
    host.tick(0);
    const diff = host.diff(rev);
    expect(diff.store).toContainEqual(["bumped", 3]);
  });

  test("a new joiner takes the full snapshot; a returning client folds diffs back to the same world", () => {
    const host = runner();
    host.join("alice", true);
    host.tick(1);
    const baseline = host.snapshot();
    const baselineRevision = host.revision();

    host.join("bob", true);
    host.command("bob", "bump", { by: 1 });
    host.tick(1);

    const rebuilt = applyWorldDiff(baseline, host.diff(baselineRevision));
    const live = host.snapshot();
    const ids = (snap: typeof rebuilt) =>
      new Set((snap["entities"] as { id: string }[]).map((e) => e.id));
    expect(ids(rebuilt)).toEqual(ids(live));
    expect(new Map(rebuilt["store"] as [string, unknown][])).toEqual(
      new Map(live["store"] as [string, unknown][]),
    );
    expect(rebuilt["stats"]).toEqual(live["stats"]);
  });

  test("leave fires onPlayerLeave, despawns the entity, and the removal reaches diffs", () => {
    const host = runner();
    host.join("alice", true);
    host.tick(1);
    const rev = host.revision();
    host.leave("alice");
    host.tick(0);
    expect(host.members()).toEqual([]);
    expect(host.context().scene.entity.get("alice")).toBeNull();
    expect(host.diff(rev).removedEntities).toContain("alice");
  });

  test("input frames are stored and retrievable per user", () => {
    const host = runner();
    host.input("alice", { held: ["moveForward"], pointer: null });
    expect(host.heldInput("alice")).toEqual({ held: ["moveForward"], pointer: null });
    expect(host.heldInput("bob")).toBeNull();
  });

  test("restore rehydrates a persisted world without re-seeding, and onInit-registered commands still work", () => {
    const origin = runner();
    origin.join("alice", true);
    origin.command("alice", "bump", { by: 2 });
    origin.tick(1);
    const saved = origin.snapshot();

    const restored = runner(saved);
    expect(restored.context().scene.entity.get("alice")).not.toBeNull();
    expect(restored.context().game.store.get("started")).toBe(true);
    expect(restored.context().game.store.get("bumped")).toBe(2);
    expect(restored.context().scene.entity.get("mover")?.position[0]).toBeCloseTo(1);

    restored.command("alice", "bump", { by: 5 });
    expect(restored.context().game.store.get("bumped")).toBe(7);
  });
});
