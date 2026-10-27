import { describe, expect, test } from "bun:test";

import { findEditorMarker } from "@jgengine/core/editor/document";

import { enemyById } from "../entities/enemies/catalog";
import { scrapQuests } from "../quests/catalog";
import { authoredScene } from "../world/level";
import { ZONES } from "../world/zones";
import { AMMO_CRATES } from "./ammoCrates";

/** Close enough to a boss to restock mid-fight. */
const BOSS_CRATE_REACH = 40;

describe("scrap-signal ammo crates", () => {
  test("every boss, zone or quest, has an ammo crate in its yard", () => {
    const questBosses = scrapQuests.flatMap((quest) => {
      const spawn = quest.spawn;
      if (spawn === undefined || enemyById(spawn.catalogId)?.family !== "boss") return [];
      const marker = findEditorMarker(authoredScene, spawn.marker);
      if (marker === undefined) throw new Error(`missing marker ${spawn.marker}`);
      return [{ id: spawn.instanceId, x: marker.position.x, z: marker.position.z }];
    });
    const zoneBosses = ZONES.flatMap((zone) => (zone.boss === undefined ? [] : [{ id: zone.boss.instanceId, x: zone.boss.x, z: zone.boss.z }]));
    const bosses = [...zoneBosses, ...questBosses];
    expect(bosses.length).toBeGreaterThan(3);
    for (const boss of bosses) {
      const nearest = Math.min(...AMMO_CRATES.map((crate) => Math.hypot(crate.x - boss.x, crate.z - boss.z)));
      expect({ boss: boss.id, near: nearest <= BOSS_CRATE_REACH }).toEqual({ boss: boss.id, near: true });
    }
  });

  test("crate ids are unique", () => {
    expect(new Set(AMMO_CRATES.map((crate) => crate.id)).size).toBe(AMMO_CRATES.length);
  });
});
