import { describe, expect, test } from "bun:test";
import {
  createDeathSystem,
  deathReasonFromEffect,
  normalizeOnDeath,
  type DeathSystemDeps,
  type OnDeathSpec,
} from "@jgengine/core/combat/death";
import { createGameEvents, type EntityDiedEvent } from "@jgengine/core/game/events";
import type { Drop } from "@jgengine/core/game/lootTable";

function createGraveyard(onDeath: OnDeathSpec | null) {
  const events = createGameEvents();
  const died: EntityDiedEvent[] = [];
  events.on("entity.died", (event) => died.push(event));
  const commands: { name: string; args: unknown }[] = [];
  const despawned: string[] = [];
  const deps: DeathSystemDeps = {
    resolveOnDeath: () => onDeath,
    resolveIdentity: (instanceId) =>
      instanceId === "ghost" ? null : { catalogId: "bandit", position: [1, 0, 2] },
    loot: { roll: (tableId): Drop[] => [{ item: `${tableId}_item`, count: 1 }] },
    events,
    runCommand: (name, args) => commands.push({ name, args }),
    despawn: (instanceId) => despawned.push(instanceId),
  };
  return { system: createDeathSystem(deps), died, commands, despawned };
}

const REASON_AWARE: OnDeathSpec = {
  drops: [
    { table: "bandit_common", when: { reason: "player_kill" } },
    { table: "bandit_scrap", when: { reason: "environment" } },
    { table: "bandit_always" },
  ],
  command: { name: "player.respawn", args: { fast: true }, when: { reason: "player_kill" } },
};

describe("death system", () => {
  test("normalizeOnDeath expands legacy shorthand", () => {
    expect(normalizeOnDeath({ drops: "mob_tier_1", command: "player.respawn" })).toEqual({
      drops: [{ table: "mob_tier_1" }],
      command: { name: "player.respawn" },
      dropMode: "grant",
    });
    expect(normalizeOnDeath(null)).toEqual({ drops: [], command: null, dropMode: "grant" });
  });

  test("normalizeOnDeath threads dropMode and scatter through unchanged", () => {
    expect(
      normalizeOnDeath({ drops: "mob_tier_1", dropMode: "world", scatter: { radius: 2, minRadius: 0.2 } }),
    ).toEqual({
      drops: [{ table: "mob_tier_1" }],
      command: null,
      dropMode: "world",
      scatter: { radius: 2, minRadius: 0.2 },
    });
  });

  test("player kill rolls matching tables, runs the command, and despawns", () => {
    const { system, commands, despawned } = createGraveyard(REASON_AWARE);
    const resolution = system.resolveDeath("mob1", { kind: "player_kill", killerUserId: "u1" });
    expect(resolution).toEqual({
      status: "resolved",
      drops: [
        { item: "bandit_common_item", count: 1 },
        { item: "bandit_always_item", count: 1 },
      ],
      ranCommand: "player.respawn",
    });
    expect(commands).toEqual([{ name: "player.respawn", args: { fast: true } }]);
    expect(despawned).toEqual(["mob1"]);
  });

  test("environment death rolls the environment table and skips the command", () => {
    const { system, commands } = createGraveyard(REASON_AWARE);
    const resolution = system.resolveDeath("mob1", { kind: "environment", source: "fall" });
    expect(resolution).toEqual({
      status: "resolved",
      drops: [
        { item: "bandit_scrap_item", count: 1 },
        { item: "bandit_always_item", count: 1 },
      ],
      ranCommand: null,
    });
    expect(commands).toEqual([]);
  });

  test("emits entity.died with the death reason before resolving drops", () => {
    const { system, died } = createGraveyard(REASON_AWARE);
    const reason = { kind: "player_kill", killerUserId: "u1", via: { item: "pistol" } } as const;
    system.resolveDeath("mob1", reason);
    expect(died).toEqual([
      { instanceId: "mob1", catalogId: "bandit", reason, position: [1, 0, 2] },
    ]);
  });

  test("re-entry and unknown instances reject", () => {
    const { system, died, despawned } = createGraveyard(REASON_AWARE);
    system.resolveDeath("mob1", { kind: "self", source: "out_of_bounds" });
    expect(system.resolveDeath("mob1", { kind: "self", source: "out_of_bounds" })).toEqual({
      status: "rejected",
      reason: "already-dead",
    });
    expect(system.resolveDeath("ghost", { kind: "self", source: "out_of_bounds" })).toEqual({
      status: "rejected",
      reason: "unknown-instance",
    });
    expect(died).toHaveLength(1);
    expect(despawned).toEqual(["mob1"]);
  });

  test("revive clears the dead mark so the same id can die again", () => {
    const { system, died, despawned } = createGraveyard(REASON_AWARE);
    system.resolveDeath("mob1", { kind: "player_kill", killerUserId: "u1" });
    expect(system.revive("mob1")).toBe(true);
    expect(system.revive("mob1")).toBe(false);
    expect(system.resolveDeath("mob1", { kind: "player_kill", killerUserId: "u1" }).status).toBe(
      "resolved",
    );
    expect(died).toHaveLength(2);
    expect(despawned).toEqual(["mob1", "mob1"]);
  });

  test("deathReasonFromEffect maps player sources to player_kill and others to environment", () => {
    expect(
      deathReasonFromEffect({
        from: "player1",
        via: { item: "pistol" },
        userIdOf: (instanceId) => (instanceId === "player1" ? "u1" : undefined),
      }),
    ).toEqual({ kind: "player_kill", killerUserId: "u1", via: { item: "pistol" } });
    expect(deathReasonFromEffect({ from: "env:spike_trap", via: { item: "spike" } })).toEqual({
      kind: "environment",
      source: "spike",
    });
    expect(deathReasonFromEffect({ from: "env:void", via: { amount: 999 } })).toEqual({
      kind: "environment",
      source: "effect",
    });
  });
});
