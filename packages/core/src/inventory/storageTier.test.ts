import { describe, expect, test } from "bun:test";

import {
  createDeliveryQueue,
  insureLost,
  partitionOnDeath,
  resolveConsolation,
  tierOf,
  type ContainerSnapshot,
  type InsurancePolicy,
} from "./storageTier";

const containers: ContainerSnapshot[] = [
  { inventoryId: "rig", tier: "carried", items: [{ itemId: "ammo", count: 30 }, { itemId: "medkit", count: 1 }] },
  { inventoryId: "backpack", tier: "carried", items: [{ itemId: "ammo", count: 10 }, { itemId: "loot_gpu", count: 2 }] },
  { inventoryId: "secure", tier: "banked", items: [{ itemId: "keycard", count: 1 }] },
  { inventoryId: "stash", tier: "banked", items: [{ itemId: "roubles", count: 500 }] },
];

describe("storage tier", () => {
  test("tierOf defaults unknown containers to carried", () => {
    expect(tierOf({ stash: "banked" }, "stash")).toBe("banked");
    expect(tierOf({ stash: "banked" }, "pockets")).toBe("carried");
  });

  test("partitionOnDeath keeps banked, loses carried, and merges stacks", () => {
    const { kept, lost } = partitionOnDeath(containers);
    expect(kept).toEqual([{ itemId: "keycard", count: 1 }, { itemId: "roubles", count: 500 }]);
    expect(lost).toEqual([
      { itemId: "ammo", count: 40 },
      { itemId: "medkit", count: 1 },
      { itemId: "loot_gpu", count: 2 },
    ]);
  });

  test("delivery queue schedules, reports due, and claims once", () => {
    const queue = createDeliveryQueue();
    const a = queue.schedule({ userId: "u1", inventoryId: "stash", items: [{ itemId: "rifle", count: 1 }], deliverAt: 100 });
    queue.schedule({ userId: "u1", inventoryId: "stash", items: [{ itemId: "armor", count: 1 }], deliverAt: 300 });
    expect(a.id).toBe("delivery_1");
    expect(queue.pending("u1")).toHaveLength(2);
    expect(queue.due(150).map((e) => e.id)).toEqual(["delivery_1"]);
    const claimed = queue.claimDue(150);
    expect(claimed.map((e) => e.id)).toEqual(["delivery_1"]);
    expect(queue.claimDue(150)).toHaveLength(0);
    expect(queue.pending("u1")).toHaveLength(1);
  });

  test("cancel removes a pending delivery", () => {
    const queue = createDeliveryQueue();
    const entry = queue.schedule({ userId: "u1", inventoryId: "stash", items: [], deliverAt: 10 });
    expect(queue.cancel(entry.id)).toBe(true);
    expect(queue.cancel(entry.id)).toBe(false);
    expect(queue.pending()).toHaveLength(0);
  });

  test("insureLost filters to insured items and stamps a delayed deliverAt", () => {
    const policy: InsurancePolicy = {
      isInsured: (id) => id === "rifle" || id === "armor",
      returnInventoryId: "stash",
      delaySeconds: [3600, 7200],
    };
    const scheduled = insureLost([{ itemId: "rifle", count: 1 }, { itemId: "ammo", count: 40 }], policy, "u1", 1000, () => 0);
    expect(scheduled).toEqual({
      userId: "u1",
      inventoryId: "stash",
      items: [{ itemId: "rifle", count: 1 }],
      deliverAt: 1000 + 3600,
    });
    expect(insureLost([{ itemId: "ammo", count: 40 }], policy, "u1", 1000, () => 0)).toBeNull();
  });

  test("insureLost feeds straight into the delivery queue", () => {
    const policy: InsurancePolicy = { isInsured: () => true, returnInventoryId: "stash", delaySeconds: 60 };
    const queue = createDeliveryQueue();
    const { lost } = partitionOnDeath(containers);
    const scheduled = insureLost(lost, policy, "u1", 0);
    expect(scheduled).not.toBeNull();
    queue.schedule(scheduled!);
    expect(queue.due(60)).toHaveLength(1);
    expect(queue.due(59)).toHaveLength(0);
  });

  test("consolation grant honors the when policy", () => {
    const survived = partitionOnDeath(containers);
    expect(resolveConsolation({ loadoutId: "gear_ticket" }, survived)).toEqual({ loadoutId: "gear_ticket" });
    expect(resolveConsolation({ loadoutId: "gear_ticket", when: "if-carried-empty" }, survived)).toBeNull();
    const brokePartition = partitionOnDeath([{ inventoryId: "rig", tier: "carried", items: [] }]);
    expect(resolveConsolation({ loadoutId: "gear_ticket", when: "if-carried-empty" }, brokePartition)).toEqual({
      loadoutId: "gear_ticket",
    });
  });
});
