import { describe, expect, test } from "bun:test";

import { BOSS_AURA, createBossAuraField, reconcileBossAuras, type BossSample } from "./hazardAura";

const noScale = () => 1;
const boss = (id: string, x: number): BossSample => ({ id, position: [x, 0, 0], level: 1 });

describe("boss overload aura adoption", () => {
  test("damages the player only while inside a boss aura, on cadence", () => {
    const field = createBossAuraField();
    const player = { id: "p", position: [10, 0, 0] as [number, number, number] };

    // Far away: enters no aura, takes no damage.
    expect(reconcileBossAuras(field, [boss("flynt", 0)], player, BOSS_AURA.refreshMs, noScale)).toEqual([]);

    // Player steps inside: enter first, then a tick after one cadence.
    const inside = { id: "p", position: [1, 0, 0] as [number, number, number] };
    expect(reconcileBossAuras(field, [boss("flynt", 0)], inside, BOSS_AURA.refreshMs, noScale)).toEqual([]); // enter
    const hit = reconcileBossAuras(field, [boss("flynt", 0)], inside, BOSS_AURA.refreshMs, noScale);
    expect(hit).toEqual([{ bossId: "flynt", amount: BOSS_AURA.damagePerTick }]);
  });

  test("aura follows the moving boss", () => {
    const field = createBossAuraField();
    const player = { id: "p", position: [5, 0, 0] as [number, number, number] };
    // Boss far -> no membership.
    reconcileBossAuras(field, [boss("flynt", 0)], player, BOSS_AURA.refreshMs, noScale);
    expect(field.isMember("flynt", "p")).toBe(false);
    // Boss walks up to the player -> membership begins purely because the source moved.
    reconcileBossAuras(field, [boss("flynt", 4)], player, BOSS_AURA.refreshMs, noScale);
    expect(field.isMember("flynt", "p")).toBe(true);
  });

  test("a dead boss's aura is cleaned up and stops dealing damage", () => {
    const field = createBossAuraField();
    const inside = { id: "p", position: [1, 0, 0] as [number, number, number] };
    reconcileBossAuras(field, [boss("flynt", 0)], inside, BOSS_AURA.refreshMs, noScale); // enter
    reconcileBossAuras(field, [boss("flynt", 0)], inside, BOSS_AURA.refreshMs, noScale); // tick
    // Boss removed from the live set (death/despawn): source cleaned up, no more damage.
    expect(reconcileBossAuras(field, [], inside, BOSS_AURA.refreshMs, noScale)).toEqual([]);
    expect(field.hasSource("flynt")).toBe(false);
  });

  test("a downed player (null) holds the field without taking damage", () => {
    const field = createBossAuraField();
    const inside = { id: "p", position: [1, 0, 0] as [number, number, number] };
    reconcileBossAuras(field, [boss("flynt", 0)], inside, BOSS_AURA.refreshMs, noScale);
    expect(reconcileBossAuras(field, [boss("flynt", 0)], null, BOSS_AURA.refreshMs, noScale)).toEqual([]);
  });

  test("damage scales with the boss's zone level", () => {
    const field = createBossAuraField();
    const inside = { id: "p", position: [1, 0, 0] as [number, number, number] };
    const strong: BossSample = { id: "warrior", position: [0, 0, 0], level: 10 };
    reconcileBossAuras(field, [strong], inside, BOSS_AURA.refreshMs, (level) => level); // enter
    const hit = reconcileBossAuras(field, [strong], inside, BOSS_AURA.refreshMs, (level) => level);
    expect(hit).toEqual([{ bossId: "warrior", amount: BOSS_AURA.damagePerTick * 10 }]);
  });
});
