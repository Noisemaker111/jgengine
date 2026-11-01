// @skill jgengine
import { expect, test } from "bun:test";

import { createMotionTrack, createPacedSchedule, createRefillSlots, discRegion, evaluatePredicate, pickWeighted, samplePoint, tierAt } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Supply drop
 * A Schedule says when, Placement where, a Ladder names the rarity, a Table fills the crate, a Motion track is the fall, a Requirement gates opening it, and Slots hold one crate per site.
 */
test("supply drop", () => {
  const rng = seededRng("supply-drop");
  const schedule = createPacedSchedule({ firstAt: 60, every: 120 }, rng);
  const sites = createRefillSlots({ slots: ["north", "south"], refillSeconds: [30, 30] }, rng);
  const rarity = tierAt([{ id: "white", at: 0 }, { id: "purple", at: 80 }], rng() * 100)?.id ?? "white";
  const pool = { white: ["bandage", "ammo"], purple: ["rifle"] }[rarity] ?? [];
  const spawnSupplyDrop = (site: string, now: number) => {
    const [x = 0, z = 0] = samplePoint({ region: discRegion([0, 0], 40), rng }).point ?? [];
    sites.fill(site);
    return { site, rarity, loot: pickWeighted(rng, pool, () => 1), fall: createMotionTrack({ points: [[x, 80, z], [x, 0, z]], duration: 8, startAt: now }) };
  };
  const mayOpen = (level: number) => evaluatePredicate({ gte: ["player.level", rarity === "purple" ? 10 : 1] }, { player: { level } });

  expect(schedule.due(60)).toEqual([0]);
  const drop = spawnSupplyDrop(sites.ready(60)[0] ?? "north", 60);
  expect(drop.fall.arrivesAt()).toBe(68);
  expect(pool).toContain(drop.loot);
  expect(sites.isFilled("north")).toBe(true);
  sites.empty("north", 70);
  expect(sites.ready(100)).toContain("north");
  expect(mayOpen(rarity === "purple" ? 3 : 1)).toBe(rarity !== "purple");
});
