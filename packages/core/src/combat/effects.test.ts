import { describe, expect, test } from "bun:test";
import {
  createEffectSystem,
  type EffectSystemDeps,
  type LethalContext,
  type ReceiveMap,
} from "@jgengine/core/combat/effects";
import { seedStatValues, type StatCatalog, type StatValueMap } from "@jgengine/core/scene/entityStats";
import { distanceBetween } from "@jgengine/core/scene/spatial";

interface WorldEntity {
  stats: StatCatalog;
  receive: ReceiveMap;
  position?: [number, number, number];
}

function createWorld(
  entities: Record<string, WorldEntity>,
  overrides?: Partial<EffectSystemDeps> & { losBlocked?: string[] },
) {
  const stats: Record<string, StatValueMap> = {};
  for (const [instanceId, entity] of Object.entries(entities)) {
    stats[instanceId] = seedStatValues(entity.stats);
  }
  const lethalCalls: { instanceId: string; ctx: LethalContext }[] = [];
  const deps: EffectSystemDeps = {
    resolveReceive: (instanceId) => entities[instanceId]?.receive,
    resolveStats: (instanceId) => stats[instanceId],
    getStat: overrides?.getStat ?? (() => null),
    spatial: {
      inRadius: (center, radius) =>
        Object.keys(entities).filter((instanceId) => {
          const position = entities[instanceId]?.position;
          return position !== undefined && distanceBetween(center, position) <= radius;
        }),
      hasLineOfSight: (_from, to) => !(overrides?.losBlocked ?? []).includes(to),
      positionOf: (instanceId) => entities[instanceId]?.position,
    },
    onLethal: (instanceId, ctx) => lethalCalls.push({ instanceId, ctx }),
    ...(overrides?.drainStatByEffect ? { drainStatByEffect: overrides.drainStatByEffect } : {}),
  };
  return { system: createEffectSystem(deps), stats, lethalCalls };
}

describe("effect system", () => {
  test("canReceive rejects unknown effects, unknown instances, and depleted pools", () => {
    const { system } = createWorld({
      enemy: { stats: { health: { max: 10 } }, receive: { damage: { order: ["health"] } } },
    });
    expect(system.canReceive("enemy", "damage")).toBeNull();
    expect(system.canReceive("enemy", "heal")).toBe("not-receivable");
    expect(system.canReceive("ghost", "damage")).toBe("not-receivable");
    system.applyEffect({ from: "p", to: "enemy", effect: "damage", via: { amount: 10 } });
    expect(system.canReceive("enemy", "damage")).toBe("pools-depleted");
  });

  test("absorption drains pools in order and spills the remainder", () => {
    const { system, stats } = createWorld({
      enemy: {
        stats: { shield: { max: 30 }, health: { max: 100 } },
        receive: { damage: { order: ["shield", "health"] } },
      },
    });
    const results = system.applyEffect({ from: "p", to: "enemy", effect: "damage", via: { amount: 50 } });
    expect(results).toEqual([
      {
        instanceId: "enemy",
        effect: "damage",
        applied: [
          { statId: "shield", delta: -30 },
          { statId: "health", delta: -20 },
        ],
        lethal: false,
      },
    ]);
    expect(stats["enemy"]!["shield"]!.current).toBe(0);
    expect(stats["enemy"]!["health"]!.current).toBe(80);
  });

  test("negative drain restores pools and never reports lethal", () => {
    const { system, stats, lethalCalls } = createWorld({
      ally: { stats: { health: { max: 100 } }, receive: { heal: { order: ["health"] } } },
    });
    stats["ally"]!["health"] = { current: 40, max: 100, min: 0 };
    const results = system.applyEffect({ from: "p", to: "ally", effect: "heal", via: { amount: -35 } });
    expect(results[0]!.applied).toEqual([{ statId: "health", delta: 35 }]);
    expect(results[0]!.lethal).toBe(false);
    expect(stats["ally"]!["health"]!.current).toBe(75);
    expect(lethalCalls).toHaveLength(0);
  });

  test("magnitude falls back to the weapon damage stat and honors modifiers", () => {
    const { system, stats } = createWorld(
      {
        enemy: {
          stats: { health: { max: 100 } },
          receive: { damage: { order: ["health"], modifiers: { armor: 0.25 } } },
        },
      },
      { getStat: (itemId, stat) => (itemId === "sword" && stat === "damage" ? 40 : null) },
    );
    expect(system.preview({ from: "p", to: "enemy", effect: "damage", via: { item: "sword" } })).toBe(30);
    expect(stats["enemy"]!["health"]!.current).toBe(100);
    system.applyEffect({ from: "p", to: "enemy", effect: "damage", via: { item: "sword" } });
    expect(stats["enemy"]!["health"]!.current).toBe(70);
  });

  test("lethal fires onLethal exactly once when the last pool hits min", () => {
    const { system, lethalCalls } = createWorld({
      enemy: {
        stats: { shield: { max: 10 }, health: { max: 30 } },
        receive: { damage: { order: ["shield", "health"] } },
      },
    });
    const results = system.applyEffect({ from: "p", to: "enemy", effect: "damage", via: { amount: 99 } });
    expect(results[0]!.lethal).toBe(true);
    expect(lethalCalls).toEqual([
      { instanceId: "enemy", ctx: { from: "p", via: { amount: 99 }, effect: "damage" } },
    ]);
    expect(system.applyEffect({ from: "p", to: "enemy", effect: "damage", via: { amount: 99 } })).toEqual([]);
    expect(lethalCalls).toHaveLength(1);
  });

  test("AoE applies linear falloff and excludes targets without line of sight", () => {
    const { system, stats } = createWorld(
      {
        near: {
          stats: { health: { max: 100 } },
          receive: { damage: { order: ["health"] } },
          position: [0, 0, 5],
        },
        hidden: {
          stats: { health: { max: 100 } },
          receive: { damage: { order: ["health"] } },
          position: [0, 0, 2],
        },
        far: {
          stats: { health: { max: 100 } },
          receive: { damage: { order: ["health"] } },
          position: [0, 0, 25],
        },
      },
      { losBlocked: ["hidden"] },
    );
    const results = system.applyEffect({
      from: "p",
      effect: "damage",
      via: { amount: 40 },
      at: [0, 0, 0],
      radius: 10,
      falloff: "linear",
    });
    expect(results.map((result) => result.instanceId)).toEqual(["near"]);
    expect(stats["near"]!["health"]!.current).toBe(80);
    expect(stats["hidden"]!["health"]!.current).toBe(100);
    expect(stats["far"]!["health"]!.current).toBe(100);
  });

  test("AoE defaults skip LoS filtering only when los is false", () => {
    const { system, stats } = createWorld(
      {
        hidden: {
          stats: { health: { max: 100 } },
          receive: { damage: { order: ["health"] } },
          position: [0, 0, 2],
        },
      },
      { losBlocked: ["hidden"] },
    );
    system.applyEffect({ from: "p", effect: "damage", via: { amount: 10 }, at: [0, 0, 0], radius: 5, los: false });
    expect(stats["hidden"]!["health"]!.current).toBe(90);
  });
});
