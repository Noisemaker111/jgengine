import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { physics, world } from "../world";
import { content } from "./content";
import { onInit } from "../loop";
import { resetSession } from "./session";
import { systems } from "./systems";
import { CAMPAIGN, campaignStore } from "./campaign";
import {
  armColony, colonyDamage, colonyHatchFactor, colonyStore, COLONY_TRAITS, FERTILE_HATCH, jellyLeft, JELLY_PER_WIN,
  LARDER_SUGAR, MANDIBLE_DEALT, PLATING_TAKEN, traitBlocked,
} from "./colony";
import { SUGAR } from "./tuning";

function runner() {
  resetSession();
  const definition = defineGameDefinition({ name: "LawnOrderColony", multiplayer: "off", world, physics, systems, loop: { onInit, onNewPlayer() {} } });
  return createHeadlessRunner({ definition, content, loop: definition.loop! });
}

describe("the colony between battles", () => {
  test("jelly is earned by wins and spent on traits, once each", () => {
    expect(jellyLeft(0, [])).toBe(0);
    expect(jellyLeft(3, ["fertile_queen"])).toBe(3 * JELLY_PER_WIN - 2);
    expect(traitBlocked("fertile_queen", 0, [])).toMatch(/jelly/);
    expect(traitBlocked("fertile_queen", 1, [])).toBeNull();
    expect(traitBlocked("fertile_queen", 5, ["fertile_queen"])).toBe("Already bred");
    // A whole campaign cannot breed everything: the queen chooses.
    const all = COLONY_TRAITS.reduce((sum, t) => sum + t.cost, 0);
    expect(CAMPAIGN.length * JELLY_PER_WIN).toBeLessThan(all);
  });

  test("traits fold into the battle only while armed", () => {
    armColony([]);
    expect(colonyHatchFactor()).toBe(1);
    expect(colonyDamage(10, { catalogId: "soldier", faction: "player" }, { catalogId: "raider", faction: "enemy" })).toBe(10);
    armColony(["fertile_queen", "serrated_mandibles", "beetle_plating"]);
    expect(colonyHatchFactor()).toBe(FERTILE_HATCH);
    expect(colonyDamage(10, { catalogId: "soldier", faction: "player" }, { catalogId: "raider", faction: "enemy" })).toBeCloseTo(10 * MANDIBLE_DEALT);
    expect(colonyDamage(10, { catalogId: "raider", faction: "enemy" }, { catalogId: "beetle", faction: "player" })).toBeCloseTo(10 * PLATING_TAKEN);
    // Black ants never borrow the red queen's traits.
    expect(colonyDamage(10, { catalogId: "raider", faction: "enemy" }, { catalogId: "soldier", faction: "player" })).toBe(10);
    armColony([]);
  });

  test("the colony.buy command spends a won mission's jelly; a campaign battle opens with the larder", () => {
    const run = runner();
    const ctx = run.ctx;
    campaignStore.write(ctx, { won: [CAMPAIGN[0]!.mission.id], mode: "campaign", stores: { sugar: 0, leaf: 0 } });
    ctx.game.commands.run("colony.buy", { trait: "deep_larder" });
    ctx.game.commands.run("colony.buy", { trait: "keen_antennae" });
    expect(colonyStore.read(ctx).traits).toEqual(["deep_larder"]);
    const before = ctx.game.economy.balance(ctx.player.userId, SUGAR);
    ctx.game.commands.run("match.start", {});
    expect(ctx.game.economy.balance(ctx.player.userId, SUGAR) - before).toBeGreaterThanOrEqual(LARDER_SUGAR);
  });

  test("a free skirmish starts a colony from nothing", () => {
    const run = runner();
    colonyStore.write(run.ctx, { traits: ["fertile_queen"] });
    run.ctx.game.commands.run("match.skirmish", {});
    expect(colonyHatchFactor()).toBe(1);
  });
});
