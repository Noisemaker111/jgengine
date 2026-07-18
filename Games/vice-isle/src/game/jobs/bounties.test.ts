import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { content } from "../content";
import { QUESTS } from "../quests/catalog";
import { BOUNTY_SPOTS } from "../world/districts";
import {
  BOUNTY_COOLDOWN_SEC,
  BOUNTY_UNLOCK_QUEST,
  bountyPayout,
  bountySpotIndex,
  bountyStore,
  onBountyKilled,
  tickBounties,
} from "./bounties";

function bootContext(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "vice-isle-bounty-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { quest: true },
    }),
    content,
    player: { userId: "p1", isNew: true },
  });
}

describe("vice-isle bounty contracts", () => {
  test("payout escalates with completed contracts and caps", () => {
    expect(bountyPayout(0)).toBe(350);
    expect(bountyPayout(1)).toBe(525);
    expect(bountyPayout(8)).toBe(bountyPayout(20));
  });

  test("spots rotate round-robin so consecutive contracts move", () => {
    const first = bountySpotIndex(0, BOUNTY_SPOTS.length);
    const second = bountySpotIndex(1, BOUNTY_SPOTS.length);
    expect(first).not.toBe(second);
    expect(bountySpotIndex(BOUNTY_SPOTS.length, BOUNTY_SPOTS.length)).toBe(first);
  });

  test("contracts stay locked until the docks are cleared", () => {
    const ctx = bootContext();
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    ctx.game.quest!.register(QUESTS);
    tickBounties(ctx);
    expect(bountyStore.read(ctx)?.targetId ?? null).toBeNull();
  });

  test("stage -> kill pays cash and arms the cooldown at the next spot", () => {
    const ctx = bootContext();
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    ctx.game.quest!.register(QUESTS);
    ctx.game.quest!.grant("p1", BOUNTY_UNLOCK_QUEST);
    ctx.game.quest!.progress("p1", BOUNTY_UNLOCK_QUEST, "clear_gangers", 5);
    expect(ctx.game.quest!.turnIn("p1", BOUNTY_UNLOCK_QUEST)).toBeNull();

    tickBounties(ctx);
    const staged = bountyStore.read(ctx);
    if (staged === undefined || staged.targetId === null) throw new Error("expected a staged bounty");
    const target = ctx.scene.entity.get(staged.targetId);
    if (target === null) throw new Error("expected the bounty target entity");
    expect(target.name).toBe("bounty_mark");
    const spot = BOUNTY_SPOTS[0]!;
    expect(staged.spotId).toBe(spot.id);
    expect(target.position[0]).toBeCloseTo(spot.position[0]);
    expect(target.position[2]).toBeCloseTo(spot.position[2]);

    const before = ctx.game.economy.balance("p1", "cash");
    ctx.scene.entity.despawn(staged.targetId);
    expect(onBountyKilled(ctx, staged.targetId)).toBe(true);
    expect(ctx.game.economy.balance("p1", "cash") - before).toBe(bountyPayout(0));
    const settled = bountyStore.read(ctx);
    expect(settled?.completed).toBe(1);
    expect(settled?.targetId).toBeNull();
    expect(settled?.nextAt).toBeGreaterThanOrEqual(BOUNTY_COOLDOWN_SEC);

    // Before the cooldown elapses nothing stages; unrelated kills settle nothing.
    tickBounties(ctx);
    expect(bountyStore.read(ctx)?.targetId).toBeNull();
    expect(onBountyKilled(ctx, "someone_else")).toBe(false);
  });
});
