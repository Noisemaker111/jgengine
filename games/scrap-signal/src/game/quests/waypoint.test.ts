import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { QuestJournal } from "@jgengine/core/mission/quest";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { QUEST_IDS, quests } from "./catalog";
import { questWaypoint } from "./waypoint";

function bootContext(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "scrap-waypoint-test", assets: createAssetCatalog(), multiplayer: "off", features: { quest: true } }),
    content: {},
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
  ctx.scene.entity.spawn("bolt", { id: "bolt_1", position: [6, 0, 8] });
  journal(ctx).register(quests);
  return ctx;
}

function journal(ctx: GameContext): QuestJournal {
  const quest = ctx.game.quest;
  if (quest === undefined) throw new Error("quest feature is off");
  return quest;
}

describe("scrap-signal quest marker", () => {
  test("with no quest it points at the person who has one", () => {
    expect(questWaypoint(bootContext())).toEqual({ x: 6, y: 0, z: 8, kind: "npc", label: "Talk to B0-LT" });
  });

  test("a kill objective points at the nearest living target", () => {
    const ctx = bootContext();
    journal(ctx).accept("p1", QUEST_IDS.firstGun);
    journal(ctx).progress("p1", QUEST_IDS.firstGun, "chest", 1);
    journal(ctx).progress("p1", QUEST_IDS.firstGun, "gun", 1);
    journal(ctx).turnIn("p1", QUEST_IDS.firstGun);
    journal(ctx).accept("p1", QUEST_IDS.targetPractice);
    ctx.scene.entity.spawn("bruiser_brat", { id: "far", position: [40, 0, 0] });
    ctx.scene.entity.spawn("bruiser_brat", { id: "near", position: [0, 0, 12] });
    expect(questWaypoint(ctx)).toMatchObject({ x: 0, z: 12, kind: "enemy" });
  });

  test("a finished quest points back at its giver", () => {
    const ctx = bootContext();
    journal(ctx).accept("p1", QUEST_IDS.firstGun);
    journal(ctx).progress("p1", QUEST_IDS.firstGun, "chest", 1);
    journal(ctx).progress("p1", QUEST_IDS.firstGun, "gun", 1);
    expect(questWaypoint(ctx)).toMatchObject({ x: 6, z: 8, kind: "npc", label: "Return to B0-LT" });
  });
});
