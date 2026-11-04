import { describe, expect, test } from "bun:test";
import type { ProjectileShotInput } from "@jgengine/core/combat/projectiles";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { huntTargetFor, noteShotNoise, tickFront } from "../../encounters/front";
import { content } from "../../content";
import { inventories } from "../../inventories";
import { playerDef } from "../players/catalog";
import { tickEnemies } from "./ai";
import { BACK_OFF_SHARE, pendingWindup, windupMs } from "./behavior";
import { enemyById } from "./catalog";

describe("scrap-signal enemy ai", () => {
  test("an enemy that heard a shot still attacks the player standing next to it", () => {
    const ctx = createGameContext({
      definition: defineGameDefinition({ name: "scrap-ai-test", assets: createAssetCatalog(), multiplayer: "off" }),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    ctx.scene.entity.spawn("husk", { id: "husk_1", position: [1.2, 0, 0] });
    const attacks: string[] = [];
    const play = ctx.game.playEntityAnimation.bind(ctx.game);
    ctx.game.playEntityAnimation = (id, clip, ...rest) => {
      if (clip === "attack") attacks.push(id);
      return play(id, clip, ...rest);
    };

    noteShotNoise(ctx, "gun_test", [0, 0, 0]);
    tickFront(ctx, 1);
    expect(huntTargetFor(ctx, "husk_1")).not.toBeNull();

    tickEnemies(ctx, 0.1);
    expect(attacks).toContain("husk_1");
  });
});

interface Arena {
  ctx: GameContext;
  shots: ProjectileShotInput[];
  dodges: string[];
  vitals(): number;
  run(seconds: number): void;
  movePlayer(position: EntityPosition): void;
}

function arena(enemyId: string, at: EntityPosition): Arena {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "scrap-counter-test", assets: createAssetCatalog(), multiplayer: "off", inventories }),
    content,
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn(playerDef.id, { id: "p1", position: [0, 0, 0] });
  ctx.scene.entity.spawn(enemyId, { id: "foe", position: at });
  const shots: ProjectileShotInput[] = [];
  const fire = ctx.scene.entity.fireProjectile.bind(ctx.scene.entity);
  ctx.scene.entity.fireProjectile = (input) => {
    shots.push(input);
    return fire(input);
  };
  const dodges: string[] = [];
  const float = ctx.scene.entity.floatText.bind(ctx.scene.entity);
  ctx.scene.entity.floatText = (input) => {
    if (input.text === "DODGED") dodges.push(input.instanceId);
    float(input);
  };
  return {
    ctx,
    shots,
    dodges,
    vitals: () => (ctx.scene.entity.stats.get("p1", "health")?.current ?? 0) + (ctx.scene.entity.stats.get("p1", "shield")?.current ?? 0),
    run: (seconds) => {
      for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
        ctx.time.advance(1 / 60);
        tickEnemies(ctx, 1 / 60);
      }
    },
    movePlayer: (position) => ctx.scene.entity.update("p1", { position }),
  };
}

function husk() {
  const def = enemyById("husk");
  if (def === undefined) throw new Error("husk missing");
  return def;
}

describe("enemy counter windows", () => {
  test("a swing winds up before it lands, and lands on a player who stays put", () => {
    const a = arena("husk", [1.2, 0, 0]);
    const full = a.vitals();
    a.run(1 / 60);
    expect(pendingWindup(a.ctx, "foe")?.kind).toBe("swing");
    expect(a.vitals()).toBe(full);
    a.run(windupMs(husk(), "swing") / 1000);
    expect(a.vitals()).toBeLessThan(full);
  });

  test("stepping out of the swing's arc during the wind-up dodges it", () => {
    const a = arena("husk", [1.2, 0, 0]);
    const full = a.vitals();
    a.run(1 / 60);
    expect(pendingWindup(a.ctx, "foe")).not.toBeNull();
    a.movePlayer([0, 0, 2.6]);
    a.run(windupMs(husk(), "swing") / 1000);
    expect(a.vitals()).toBe(full);
    expect(a.dodges).toEqual(["p1"]);
  });

  test("killing the fighter mid-swing calls the blow off", () => {
    const a = arena("husk", [1.2, 0, 0]);
    const full = a.vitals();
    a.run(1 / 60);
    expect(pendingWindup(a.ctx, "foe")).not.toBeNull();
    a.ctx.scene.entity.despawn("foe");
    a.run(1);
    expect(pendingWindup(a.ctx, "foe")).toBeNull();
    expect(a.vitals()).toBe(full);
  });

  test("a gunner aims before it fires, and the round goes where it aimed", () => {
    const a = arena("marauder", [0, 0, 10]);
    a.run(1 / 60);
    const pending = pendingWindup(a.ctx, "foe");
    expect(pending?.kind).toBe("shot");
    expect(a.shots).toHaveLength(0);
    a.movePlayer([3, 0, 0]);
    a.run(0.6);
    const shot = a.shots[0];
    if (shot === undefined || !("direction" in shot.aim)) throw new Error("expected one aimed round");
    // Fired at the spot it locked (the origin), not at the player who stepped 3 m aside.
    expect(Math.abs(shot.aim.direction[0])).toBeLessThan(0.02);
  });

  test("a gunner the player rushes gives ground", () => {
    const def = enemyById("marauder");
    if (def === undefined || def.attack.kind !== "ranged") throw new Error("marauder missing");
    const close = def.attack.preferRange * BACK_OFF_SHARE * 0.5;
    const a = arena("marauder", [0, 0, close]);
    a.run(1.5);
    const foe = a.ctx.scene.entity.get("foe");
    expect(foe?.position[2] ?? 0).toBeGreaterThan(close + 1);
  });
});
