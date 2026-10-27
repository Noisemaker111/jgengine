import { describe, expect, test } from "bun:test";
import { findEditorMarker } from "@jgengine/core/editor/document";

import { countsAsKillOf, enemyById } from "../entities/enemies/catalog";
import { ENEMY_VARIANTS } from "../entities/enemies/variants";
import { UNIQUE_GUNS, uniqueGun } from "../handroll";
import { authoredScene, SIDE_POIS } from "../world/level";
import { ZONES, zoneAt } from "../world/zones";
import { RED_CHESTS } from "../world/setup";
import { CONVOY_CHEST, scrapQuests, type ScrapQuest } from "./catalog";

/** Every standing population the world holds: each zone's camps and boss, and each side camp. */
const PLACES: readonly { id: string; members: readonly { catalogId: string; count: number }[] }[] = [
  ...ZONES.map((zone) => ({
    id: zone.id,
    members: [...zone.clusters, ...(zone.boss === undefined ? [] : [{ catalogId: zone.boss.catalogId, count: 1 }])],
  })),
  ...SIDE_POIS.map((poi) => ({ id: poi.id, members: poi.spawns })),
];

/** The most of `target` one place holds at once, counting the local breeds that count as it. */
function mostInOnePlace(target: string): number {
  return Math.max(
    0,
    ...PLACES.map((place) =>
      place.members.filter((member) => countsAsKillOf(member.catalogId, target)).reduce((sum, member) => sum + member.count, 0),
    ),
  );
}

function spawnedBy(quest: ScrapQuest, target: string): boolean {
  return quest.spawn !== undefined && quest.spawn.catalogId === target;
}

describe("scrap-signal quest catalog", () => {
  test("ids are unique and every prerequisite is a real quest that comes first", () => {
    const ids = scrapQuests.map((quest) => quest.id);
    expect(new Set(ids).size).toBe(ids.length);
    scrapQuests.forEach((quest, index) => {
      for (const required of quest.requires ?? []) {
        const at = ids.indexOf(required);
        expect(at, `${quest.id} requires ${required}`).toBeGreaterThanOrEqual(0);
        if (scrapQuests[at]?.giver === quest.giver) expect(at, `${quest.id} after ${required}`).toBeLessThan(index);
      }
    });
  });

  test("every kill job can be finished in one place without waiting for a respawn", () => {
    for (const quest of scrapQuests) {
      for (const objective of quest.objectives) {
        if (objective.kind !== "kill") continue;
        expect(enemyById(objective.target), `${quest.id}: ${objective.target}`).toBeDefined();
        if (spawnedBy(quest, objective.target)) continue;
        expect(mostInOnePlace(objective.target), `${quest.id}: ${objective.count} ${objective.target}`).toBeGreaterThanOrEqual(objective.count);
      }
    }
  });

  test("every named target is put in its own zone by exactly one quest", () => {
    for (const variant of ENEMY_VARIANTS.filter((candidate) => candidate.named === true)) {
      const hunters = scrapQuests.filter((quest) => spawnedBy(quest, variant.id));
      expect(hunters.map((quest) => quest.id), variant.id).toHaveLength(1);
      const marker = findEditorMarker(authoredScene, hunters[0]?.spawn?.marker ?? "");
      if (marker === undefined) throw new Error(`${variant.id}: no marker`);
      expect(zoneAt(marker.position.x, marker.position.z)?.id, variant.id).toBe(variant.zone);
    }
  });

  test("every unique gun is the reward of exactly one quest", () => {
    const rewards = scrapQuests.flatMap((quest) => (quest.reward.gun === undefined ? [] : [quest.reward.gun]));
    for (const name of rewards) expect(uniqueGun(name), name).toBeDefined();
    expect([...rewards].sort()).toEqual(UNIQUE_GUNS.map((gun) => gun.name).sort());
  });

  test("the convoy crate is the red chest in Rustflat's bruiser camp", () => {
    const index = Number(CONVOY_CHEST.replace("red_chest_", ""));
    const crate = RED_CHESTS[index];
    const bruisers = ZONES.find((zone) => zone.id === "rustflat_waste")?.clusters.find((cluster) => cluster.catalogId === "bruiser");
    if (crate === undefined || bruisers === undefined) throw new Error("no convoy crate or bruiser camp");
    expect(Math.hypot(crate.x - bruisers.center.x, crate.z - bruisers.center.z)).toBeLessThan(bruisers.radius);
  });

  test("the catalog holds the brief's 48 quests, most of them side jobs", () => {
    expect(scrapQuests.length).toBeGreaterThanOrEqual(48);
    expect(scrapQuests.filter((quest) => !quest.main).length).toBeGreaterThan(scrapQuests.length / 2);
  });
});
