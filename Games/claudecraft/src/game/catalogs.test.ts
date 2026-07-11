import { describe, expect, test } from "bun:test";
import { GAME_ICON_NAMES } from "@jgengine/react/gameIcons";
import { CLASSES } from "./classes/catalog";
import { itemDefById, ITEMS } from "./items/catalog";
import { MOBS, mobById } from "./entities/enemies/catalog";
import { QUESTS } from "./quests/catalog";
import { NPCS } from "./entities/npcs/catalog";

const ICON_SET = new Set<string>(GAME_ICON_NAMES);

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

describe("catalogs", () => {
  test("catalogs meet breadth floors", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(280);
    expect(MOBS.length).toBeGreaterThanOrEqual(55);
    expect(QUESTS.length).toBeGreaterThanOrEqual(70);
    expect(CLASSES.reduce((total, cls) => total + cls.abilities.length, 0)).toBeGreaterThanOrEqual(110);
    expect(NPCS.length).toBeGreaterThanOrEqual(14);
  });

  test("every mob drop itemId resolves via itemDefById", () => {
    for (const mob of MOBS) {
      for (const drop of mob.drops) {
        if (drop.itemId === undefined) continue;
        expect(itemDefById(drop.itemId), `${mob.id} drops unknown item "${drop.itemId}"`).not.toBeNull();
      }
    }
  });

  test("every quest kill objective target resolves via mobById", () => {
    for (const quest of QUESTS) {
      for (const objective of quest.objectives) {
        if (objective.kind !== "kill") continue;
        expect(objective.target, `${quest.id} kill objective missing target`).toBeDefined();
        expect(
          mobById(objective.target!),
          `${quest.id} kill objective targets unknown mob "${objective.target}"`,
        ).not.toBeNull();
      }
    }
  });

  test("every quest collect objective item resolves via itemDefById and is dropped by at least one mob or granted by a prior quest reward", () => {
    for (const [index, quest] of QUESTS.entries()) {
      for (const objective of quest.objectives) {
        if (objective.kind !== "collect") continue;
        expect(objective.item, `${quest.id} collect objective missing item`).toBeDefined();
        expect(
          itemDefById(objective.item!),
          `${quest.id} collect objective references unknown item "${objective.item}"`,
        ).not.toBeNull();
        const droppedByMob = MOBS.some((mob) => mob.drops.some((drop) => drop.itemId === objective.item));
        const grantedByPriorQuest = QUESTS.slice(0, index).some((prior) =>
          prior.rewards?.items?.some((reward) => reward.item === objective.item) ?? false,
        );
        expect(
          droppedByMob || grantedByPriorQuest,
          `${quest.id} collect item "${objective.item}" has no mob supply or prior quest reward`,
        ).toBe(true);
      }
    }
  });

  test("every class startWeapon resolves via itemDefById", () => {
    for (const cls of CLASSES) {
      expect(itemDefById(cls.startWeapon), `${cls.id} startWeapon unknown item "${cls.startWeapon}"`).not.toBeNull();
    }
  });

  test("every quest giver/turnIn npc id exists and matches its questgiver's quests", () => {
    const npcById = new Map(NPCS.map((npc) => [npc.id, npc]));
    for (const quest of QUESTS) {
      if (quest.giver !== undefined) {
        const giver = npcById.get(quest.giver);
        expect(giver, `${quest.id} giver "${quest.giver}" not found in NPCS`).toBeDefined();
        expect(giver?.kind, `${quest.id} giver "${quest.giver}" is not a questgiver`).toBe("questgiver");
      }
      if (quest.turnIn !== undefined) {
        const turnInNpc = npcById.get(quest.turnIn);
        expect(turnInNpc, `${quest.id} turnIn "${quest.turnIn}" not found in NPCS`).toBeDefined();
        expect(turnInNpc?.kind, `${quest.id} turnIn "${quest.turnIn}" is not a questgiver`).toBe("questgiver");
      }
    }
  });

  test("all item ids are unique", () => {
    expect(duplicates(ITEMS.map((item) => item.id))).toEqual([]);
  });

  test("all mob ids are unique", () => {
    expect(duplicates(MOBS.map((mob) => mob.id))).toEqual([]);
  });

  test("all quest ids are unique", () => {
    expect(duplicates(QUESTS.map((quest) => quest.id))).toEqual([]);
  });

  test("all npc ids are unique", () => {
    expect(duplicates(NPCS.map((npc) => npc.id))).toEqual([]);
  });

  test("all ability ids are unique", () => {
    expect(duplicates(CLASSES.flatMap((cls) => cls.abilities.map((ability) => ability.id)))).toEqual([]);
  });

  test("every ItemDef.icon is a valid GameIconName", () => {
    for (const item of ITEMS) {
      expect(ICON_SET.has(item.icon), `item "${item.id}" has invalid icon "${item.icon}"`).toBe(true);
    }
  });

  test("every AbilityDef.icon is a valid GameIconName", () => {
    for (const cls of CLASSES) {
      for (const ability of cls.abilities) {
        expect(
          ICON_SET.has(ability.icon),
          `ability "${ability.id}" has invalid icon "${ability.icon}"`,
        ).toBe(true);
      }
    }
  });
});
