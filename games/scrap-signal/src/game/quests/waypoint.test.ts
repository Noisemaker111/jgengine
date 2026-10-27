import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { QuestJournal } from "@jgengine/core/mission/quest";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { QUEST_IDS, quests } from "./catalog";
import { gunById, restoreMagazines, rollGun } from "../handroll";
import { AMMO_STAT_IDS } from "../ammo";
import { AMMO_CRATES } from "../items/ammoCrates";
import { inventories } from "../inventories";
import { seededRng } from "@jgengine/core/random/rng";
import { creditObjective, talkTo } from "./givers";
import { questWaypoint } from "./waypoint";
import { ammoCratesOpenedStore } from "../stores";

function bootContext(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "scrap-waypoint-test", assets: createAssetCatalog(), multiplayer: "off", features: { quest: true }, inventories }),
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

  test("a local breed counts as its base, for the marker and the journal", () => {
    const ctx = bootContext();
    journal(ctx).grant("p1", QUEST_IDS.shoreParty);
    ctx.scene.entity.spawn("scorch_husk", { id: "breed", position: [0, 0, 9] });
    expect(questWaypoint(ctx)).toMatchObject({ x: 0, z: 9, kind: "enemy" });
    creditObjective(ctx, "kill", "husk");
    const entry = journal(ctx).list("p1").find((candidate) => candidate.questId === QUEST_IDS.shoreParty);
    expect(entry?.objectives.find((objective) => objective.id === "husks")?.progress).toBe(1);
  });

  test("a reward gun lands past the giver's talk range, so E picks it up instead of talking", () => {
    const ctx = bootContext();
    ctx.scene.entity.update("p1", { position: [5, 0, 7] });
    journal(ctx).grant("p1", "q_scorched_earth");
    journal(ctx).progress("p1", "q_scorched_earth", "scorched", 2);
    talkTo(ctx, "bolt");
    const [drop] = ctx.scene.worldItem.list();
    const at = drop === undefined ? undefined : ctx.scene.entity.get(drop.instanceId)?.position;
    if (drop === undefined || at === undefined) throw new Error("no reward on the ground");
    expect(gunById(drop.itemId)?.name).toBe("Kindler");
    expect(Math.hypot(at[0] - 6, at[2] - 8)).toBeGreaterThan(3.2 + 0.5);
    expect(questWaypoint(ctx)).toMatchObject({ kind: "npc" });
  });

  test("with every gun empty it points at the nearest stocked ammo crate, ahead of the quest", () => {
    const ctx = bootContext();
    const [near, far] = AMMO_CRATES;
    if (near === undefined || far === undefined) throw new Error("the world needs two ammo crates");
    ctx.scene.object.place("ammo_chest", near.x, 0, near.z, { instanceId: near.id });
    ctx.scene.object.place("ammo_chest", far.x, 0, far.z, { instanceId: far.id });
    ctx.scene.entity.update("p1", { position: [near.x, 0, near.z + 5] });
    const pistol = rollGun(seededRng("dry"), 1, { family: "pistol", rarity: "common" });
    ctx.player.inventory.put("hotbar", pistol.id, 1, { slot: 0 });
    expect(questWaypoint(ctx)).toMatchObject({ kind: "npc" });

    restoreMagazines(ctx, [{ gunId: pistol.id, loaded: 0 }]);
    expect(questWaypoint(ctx)).toMatchObject({ x: near.x, z: near.z, kind: "chest" });

    ammoCratesOpenedStore.write(ctx, { [near.id]: ctx.time.now() });
    expect(questWaypoint(ctx)).toMatchObject({ x: far.x, z: far.z, kind: "chest" });

    ctx.scene.entity.stats.set("p1", AMMO_STAT_IDS.pistol, { current: 10, max: 200 });
    expect(questWaypoint(ctx)).toMatchObject({ kind: "npc" });
  });

  test("a finished quest points back at its giver", () => {
    const ctx = bootContext();
    journal(ctx).accept("p1", QUEST_IDS.firstGun);
    journal(ctx).progress("p1", QUEST_IDS.firstGun, "chest", 1);
    journal(ctx).progress("p1", QUEST_IDS.firstGun, "gun", 1);
    expect(questWaypoint(ctx)).toMatchObject({ x: 6, z: 8, kind: "npc", label: "Return to B0-LT" });
  });
});
