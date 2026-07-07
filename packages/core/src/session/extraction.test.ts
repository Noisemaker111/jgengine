import { describe, expect, test } from "bun:test";

import type { ContainerSnapshot } from "../inventory/storageTier";
import { createRaidSession, type RaidSessionConfig } from "./extraction";

const containers: ContainerSnapshot[] = [
  { inventoryId: "rig", tier: "carried", items: [{ itemId: "loot_gpu", count: 2 }, { itemId: "ammo", count: 30 }] },
  { inventoryId: "secure", tier: "banked", items: [{ itemId: "keycard", count: 1 }] },
];

function session(overrides: Partial<RaidSessionConfig> = {}) {
  return createRaidSession({
    extracts: [{ id: "north", center: [0, 0], radius: 5, holdSeconds: 4 }],
    ...overrides,
  });
}

describe("raid extraction session", () => {
  test("hold-to-extract completes via the contested channel and banks everything carried", () => {
    const raid = session();
    const start = raid.beginExtract("u1", "north");
    expect(start?.kind).toBe("start");
    expect(raid.status("u1")).toBe("extracting");

    for (let i = 0; i < 3; i += 1) raid.tickExtract("u1", 1, { u1: 1 });
    expect(raid.status("u1")).toBe("extracting");
    raid.tickExtract("u1", 1, { u1: 1 });
    expect(raid.status("u1")).toBe("extracted");

    const result = raid.resolveExtraction("u1", containers);
    expect(result.extractId).toBe("north");
    expect(result.banked).toEqual([
      { itemId: "loot_gpu", count: 2 },
      { itemId: "ammo", count: 30 },
      { itemId: "keycard", count: 1 },
    ]);
  });

  test("taking damage interrupts the extract and returns the player to the raid", () => {
    const raid = session();
    raid.beginExtract("u1", "north");
    raid.tickExtract("u1", 2, { u1: 1 });
    const interrupt = raid.damage("u1", "sniped");
    expect(interrupt?.kind).toBe("interrupted");
    expect(raid.status("u1")).toBe("in-raid");
  });

  test("death partitions via storage tier, banks kept, drops lost, and insures", () => {
    const raid = session({
      insurance: { isInsured: (id) => id === "loot_gpu", returnInventoryId: "stash", delaySeconds: 3600 },
      consolation: { loadoutId: "scav_kit" },
    });
    const death = raid.resolveDeath("u1", containers, 1000, () => 0);
    expect(death.kept).toEqual([{ itemId: "keycard", count: 1 }]);
    expect(death.lost).toEqual([{ itemId: "loot_gpu", count: 2 }, { itemId: "ammo", count: 30 }]);
    expect(death.consolationLoadoutId).toBe("scav_kit");
    expect(death.scheduled?.deliverAt).toBe(1000 + 3600);
    expect(raid.status("u1")).toBe("dead");

    expect(raid.claimDeliveries(3599 + 1000)).toHaveLength(0);
    const due = raid.claimDeliveries(1000 + 3600);
    expect(due).toHaveLength(1);
    expect(due[0]!.items).toEqual([{ itemId: "loot_gpu", count: 2 }]);
  });

  test("player snapshot reports live extraction progress", () => {
    const raid = session();
    raid.beginExtract("u1", "north");
    raid.tickExtract("u1", 2, { u1: 1 });
    const snap = raid.playerSnapshot("u1");
    expect(snap.status).toBe("extracting");
    expect(snap.extractId).toBe("north");
    expect(snap.progress).toBeCloseTo(0.5, 5);
    expect(snap.remaining).toBeCloseTo(2, 5);
  });

  test("unknown extract points reject", () => {
    const raid = session();
    expect(raid.beginExtract("u1", "nowhere")).toBeNull();
    expect(raid.status("u1")).toBe("in-raid");
  });
});
