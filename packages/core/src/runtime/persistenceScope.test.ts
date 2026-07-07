import { describe, expect, test } from "bun:test";

import type { PlayerProfileRecord } from "./hostPersistence";
import {
  applyRunReset,
  clearRunFields,
  mergeScopes,
  partitionScopes,
  planScenarioReset,
  resetRun,
} from "./persistenceScope";
import type { RuntimePlayerRow } from "./snapshot";

describe("persistence scopes", () => {
  test("partitionScopes splits a flat record by run keys", () => {
    const scoped = partitionScopes(
      { talents: 12, blueprints: ["forge"], runInventory: ["rifle"], position: [1, 2, 3] },
      { run: ["runInventory", "position"] },
    );
    expect(scoped.meta).toEqual({ talents: 12, blueprints: ["forge"] });
    expect(scoped.run).toEqual({ runInventory: ["rifle"], position: [1, 2, 3] });
  });

  test("resetRun wipes the run scope but preserves meta; mergeScopes recombines", () => {
    const scoped = partitionScopes(
      { talents: 12, runInventory: ["rifle"] },
      { run: ["runInventory"] },
    );
    const afterReset = resetRun(scoped);
    expect(afterReset.run).toEqual({});
    expect(afterReset.meta).toEqual({ talents: 12 });
    expect(mergeScopes(afterReset)).toEqual({ talents: 12 });
  });

  test("clearRunFields empties run-scoped player-row fields, keeps meta", () => {
    const player: RuntimePlayerRow = {
      userId: "u1",
      inventories: { backpack: [{ item: "rifle", count: 1 }] },
      economy: { gold: 500 },
      unlocks: ["talent_forge", "blueprint_house"],
      quests: { mission: "active" },
      session: { runStart: 42 },
    };
    const wiped = clearRunFields(player, ["inventories", "quests", "session"]);
    expect(wiped.inventories).toEqual({});
    expect(wiped.quests).toBeUndefined();
    expect(wiped.session).toEqual({});
    expect(wiped.economy).toEqual({ gold: 500 });
    expect(wiped.unlocks).toEqual(["talent_forge", "blueprint_house"]);
    expect(player.inventories.backpack).toHaveLength(1);
  });

  test("applyRunReset bumps revision and clears run fields on a profile", () => {
    const profile: PlayerProfileRecord = {
      userId: "u1",
      gameId: "raid",
      playerState: {
        userId: "u1",
        inventories: { bag: [{ item: "loot", count: 3 }] },
        economy: { meta_shards: 9 },
        unlocks: ["perk_a"],
      },
      revision: 4,
      updatedAt: 100,
    };
    const reset = applyRunReset(profile, ["inventories"], 200);
    expect(reset.revision).toBe(5);
    expect(reset.updatedAt).toBe(200);
    expect(reset.playerState.inventories).toEqual({});
    expect(reset.playerState.economy).toEqual({ meta_shards: 9 });
    expect(reset.playerState.unlocks).toEqual(["perk_a"]);
  });

  test("planScenarioReset normalizes defaults for a season wipe", () => {
    expect(planScenarioReset({ gameId: "raid" })).toEqual({
      gameId: "raid",
      serverId: null,
      wipeChunks: true,
      wipeServerSession: true,
      resetPlayers: "none",
      runFields: [],
    });
    expect(planScenarioReset({ gameId: "raid", serverId: "s1", resetPlayers: "run", runFields: ["inventories"] })).toEqual({
      gameId: "raid",
      serverId: "s1",
      wipeChunks: true,
      wipeServerSession: true,
      resetPlayers: "run",
      runFields: ["inventories"],
    });
  });
});
