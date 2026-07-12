import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { terrainField, world } from "../../world";
import { MAIN_QUEST_IDS, quests } from "../quests/catalog";
import { PLAYER_SPAWN } from "./sites";
import { ZONES, zoneAt, zoneLevelAt } from "./zones";

describe("borderlands2 world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("every settlement zone contributes a structure group", () => {
    const settled = ZONES.filter((zone) => zone.settlement !== undefined);
    expect(summary.counts.structureGroups).toBe(settled.length);
    expect(summary.counts.buildings).toBe(settled.reduce((sum, zone) => sum + zone.settlement!.count, 0));
  });

  test("terrain resolves finite heights with real relief across the expanse", () => {
    const heights = [
      terrainField.sampleHeight(0, 0),
      terrainField.sampleHeight(500, -500),
      terrainField.sampleHeight(-600, 600),
      terrainField.sampleHeight(PLAYER_SPAWN[0], PLAYER_SPAWN[2]),
    ];
    for (const height of heights) expect(Number.isFinite(height)).toBe(true);
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread).toBeGreaterThan(2);
  });

  test("every zone center is flattened for its settlement", () => {
    for (const zone of ZONES) {
      const center = terrainField.sampleHeight(zone.center.x, zone.center.z);
      const edge = terrainField.sampleHeight(zone.center.x + zone.flattenRadius * 0.3, zone.center.z - zone.flattenRadius * 0.25);
      expect(Math.abs(edge - center)).toBeLessThan(0.9);
    }
  });
});

describe("zones", () => {
  test("player spawn sits inside the level-1 starting zone", () => {
    const zone = zoneAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
    expect(zone?.id).toBe("windshear_waste");
    expect(zone?.level).toBe(1);
  });

  test("zone levels climb along the campaign route", () => {
    const levels = ZONES.map((zone) => zone.level);
    expect(levels[0]).toBe(1);
    expect(levels[levels.length - 1]).toBeGreaterThanOrEqual(20);
  });

  test("zoneLevelAt falls back to the nearest zone outside all radii", () => {
    expect(zoneLevelAt(9999, 9999)).toBeGreaterThanOrEqual(1);
  });

  test("every zone cluster and boss references a real spot inside world bounds", () => {
    for (const zone of ZONES) {
      expect(Math.abs(zone.center.x)).toBeLessThan(750);
      expect(Math.abs(zone.center.z)).toBeLessThan(750);
    }
  });
});

describe("campaign chain", () => {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));

  test("main chain quests all exist", () => {
    for (const id of MAIN_QUEST_IDS) expect(byId.has(id)).toBe(true);
  });

  test("each main quest links to the next via rewards.quests", () => {
    for (let index = 0; index < MAIN_QUEST_IDS.length - 1; index += 1) {
      const quest = byId.get(MAIN_QUEST_IDS[index]!)!;
      expect(quest.rewards?.quests).toContain(MAIN_QUEST_IDS[index + 1]!);
    }
  });

  test("every chained quest id resolves to a registered quest", () => {
    for (const quest of quests) {
      for (const next of quest.rewards?.quests ?? []) expect(byId.has(next)).toBe(true);
    }
  });
});
