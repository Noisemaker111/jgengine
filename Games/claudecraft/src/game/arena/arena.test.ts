import { describe, expect, test } from "bun:test";

import {
  AUGMENTS,
  augmentById,
  eligibleAugments,
  FIESTA_RESPAWN_MAX,
  FIESTA_RING_MIN,
  FIESTA_RING_START,
  fiestaRespawnTime,
  ringTargetForWave,
  tierForWave,
} from "./catalog";

describe("fiesta respawn timing", () => {
  test("first death respawns at base", () => {
    expect(fiestaRespawnTime(1, 0)).toBe(3);
  });
  test("stacks per-death and per-minute penalties", () => {
    expect(fiestaRespawnTime(3, 130)).toBeCloseTo(3 + 2 * 1.2 + 2 * 1.5);
  });
  test("caps at max", () => {
    expect(fiestaRespawnTime(20, 600)).toBe(FIESTA_RESPAWN_MAX);
  });
});

describe("ring targets", () => {
  test("wave 0 keeps the full ring", () => {
    expect(ringTargetForWave(0)).toBe(FIESTA_RING_START);
  });
  test("final wave closes to the minimum", () => {
    expect(ringTargetForWave(3)).toBe(FIESTA_RING_MIN);
  });
});

describe("augments", () => {
  test("tiers map to waves", () => {
    expect(tierForWave(1)).toBe("silver");
    expect(tierForWave(2)).toBe("gold");
    expect(tierForWave(3)).toBe("prismatic");
  });
  test("every augment id resolves", () => {
    for (const aug of AUGMENTS) expect(augmentById(aug.id)?.id).toBe(aug.id);
  });
  test("casters never see physical-only cards", () => {
    const pool = eligibleAugments("silver", "mage", []);
    expect(pool.some((aug) => aug.physicalOnly === true)).toBe(false);
    expect(pool.some((aug) => aug.id === "aug_spellfire")).toBe(true);
  });
  test("owned augments are excluded", () => {
    const pool = eligibleAugments("silver", "warrior", ["aug_brutality"]);
    expect(pool.some((aug) => aug.id === "aug_brutality")).toBe(false);
  });
  test("healers get healing cards, warriors do not", () => {
    expect(eligibleAugments("silver", "priest", []).some((aug) => aug.id === "aug_mending")).toBe(true);
    expect(eligibleAugments("silver", "warrior", []).some((aug) => aug.id === "aug_mending")).toBe(false);
  });
});
