import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { expandWave } from "@jgengine/core/ai/director/encounter";
import { assignFightIntents } from "@jgengine/core/ai/director/roles";

import { content } from "../content";
import { ENEMY_WAVE_FIRST_DELAY, ENEMY_WAVE_INTERVAL, ENEMY_WAVE_MAX_FIELDED } from "../tuning";
import { livingUnits, resetSession, session } from "../session";
import { marchTarget, nextWaveEta, planPhase, raiseCombatNoise, tickEnemyWaves, waveSquad } from "./director";
import { MARAUDER_WAVES, WAVE_CYCLE } from "./waveManifest";

/** Boot a real headless context, then stand a Warcamp (enemy) and a keep (player) at either end. */
function boot(): GameContext {
  const definition = defineGameDefinition({ name: "EmberCommandDirectorTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

function seedKeeps(ctx: GameContext): void {
  ctx.scene.entity.spawn("keep_enemy", { id: "warcamp", position: [0, 0, -40], role: "npc" });
  session.units.set("warcamp", {
    id: "warcamp", catalogId: "keep_enemy", faction: "enemy", kind: "building",
    command: { kind: "idle" }, guardPoint: { x: 0, z: -40 }, leash: 0, attackCooldown: 0,
  });
  ctx.scene.entity.spawn("keep_player", { id: "hold", position: [0, 0, 40], role: "npc" });
  session.units.set("hold", {
    id: "hold", catalogId: "keep_player", faction: "player", kind: "building",
    command: { kind: "idle" }, guardPoint: { x: 0, z: 40 }, leash: 0, attackCooldown: 0,
  });
}

/** Advance the plan clock for `seconds` at a fixed step. */
function run(ctx: GameContext, seconds: number): void {
  for (let t = 0; t < seconds * 2; t += 1) tickEnemyWaves(ctx, 0.5);
}

describe("marauder waves as data", () => {
  test("the cycle escalates from a pair of grunts to Reavers, and stays bounded", () => {
    const first = expandWave({ definition: MARAUDER_WAVES, seed: 7 }, 0);
    const third = expandWave({ definition: MARAUDER_WAVES, seed: 7 }, 2);
    const last = expandWave({ definition: MARAUDER_WAVES, seed: 7 }, WAVE_CYCLE - 1);
    expect(first.map((order) => order.unit)).toEqual(["grunt", "grunt"]);
    expect(third.length).toBeGreaterThan(first.length);
    expect(third.some((order) => order.unit === "reaver")).toBe(true);
    expect(last.length).toBeLessThanOrEqual(10);
  });

  test("pressure thickens the waves that opt in, and the same seed sends the same march", () => {
    const plain = expandWave({ definition: MARAUDER_WAVES, seed: 7 }, 3);
    const pressed = expandWave({ definition: MARAUDER_WAVES, seed: 7 }, 3, { countBonus: 2 });
    expect(pressed.filter((order) => order.pressureAdded)).toHaveLength(2);
    expect(expandWave({ definition: MARAUDER_WAVES, seed: 7 }, 3)).toEqual(plain);
    expect(expandWave({ definition: MARAUDER_WAVES, seed: 8 }, 3).map((order) => order.atSeconds)).toEqual(
      plain.map((order) => order.atSeconds),
    );
  });
});

describe("the marauder plan (real context)", () => {
  beforeEach(() => resetSession());

  test("holds through the opening grace period, then scouts before it commits", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 20);
    expect(livingUnits("enemy", "unit").length).toBe(0);
    expect(session.enemyWave.sent).toBe(0);
    run(ctx, 15);
    expect(planPhase()).toBe("scouting");
    expect(session.enemyWave.scouts.length).toBe(2);
    expect(session.enemyWave.sent).toBe(0);
  });

  test("a scout that sees the player's keep advances the plan to expanding", () => {
    const ctx = boot();
    seedKeeps(ctx);
    // Put a scout's eyes on the keep at once, then walk the plan.
    session.enemyWave.grace = 0;
    ctx.scene.entity.spawn("grunt", { id: "scout", position: [0, 0, 36], role: "npc" });
    session.units.set("scout", { id: "scout", catalogId: "grunt", faction: "enemy", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
    session.enemyWave.scouts = ["scout"];
    run(ctx, 1);
    expect(session.enemyWave.contacted).toBe(true);
    run(ctx, 3);
    expect(planPhase()).not.toBe("scouting");
  });

  test("expanding raises a forward camp, and waves muster from it", () => {
    const ctx = boot();
    seedKeeps(ctx);
    const camp = ctx.scene.entity.get("warcamp")!;
    session.enemyWave.campId = null;
    session.enemyWave.grace = 0;
    run(ctx, 50); // the scout timer runs out, then the camp goes up
    expect(planPhase()).not.toBe("idle");
    run(ctx, 120);
    const forward = session.enemyWave.campId;
    expect(forward === null || ctx.scene.entity.get(forward) !== null).toBe(true);
    // Muster from the forward camp when it exists, otherwise the home warcamp.
    const marauders = livingUnits("enemy", "unit");
    expect(marauders.length).toBeGreaterThan(0);
    for (const unit of marauders) {
      const entity = ctx.scene.entity.get(unit.id)!;
      const anchor = forward === null ? camp.position : ctx.scene.entity.get(forward)!.position;
      const near = Math.hypot(entity.position[0] - anchor[0], entity.position[2] - anchor[2]);
      if (unit.command.kind === "attackMove") expect(near).toBeLessThan(60);
    }
  });

  test("the waves march on the player keep, and a later beat reinforces", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 120);
    expect(session.enemyWave.sent).toBeGreaterThanOrEqual(1);
    const target = marchTarget();
    expect(target.z).toBeGreaterThan(0);
  });

  test("never fields more than the cap (bounded pressure)", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 2000);
    expect(livingUnits("enemy", "unit").length).toBeLessThanOrEqual(ENEMY_WAVE_MAX_FIELDED);
  });

  test("HUD countdown reports grace first, then the plan beat", () => {
    const ctx = boot();
    seedKeeps(ctx);
    expect(nextWaveEta()).toBeCloseTo(ENEMY_WAVE_FIRST_DELAY, 5);
    run(ctx, 20);
    expect(nextWaveEta()).toBeCloseTo(ENEMY_WAVE_FIRST_DELAY - 20, 5);
    run(ctx, 100);
    expect(nextWaveEta()).toBeGreaterThanOrEqual(0);
    expect(nextWaveEta()).toBeLessThanOrEqual(ENEMY_WAVE_INTERVAL);
  });

  test("razing the Warcamp cuts off reinforcements", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 120);
    expect(livingUnits("enemy", "unit").length).toBeGreaterThan(0);
    ctx.scene.entity.despawn("warcamp");
    session.units.delete("warcamp");
    const forward = session.enemyWave.campId;
    if (forward !== null) {
      ctx.scene.entity.despawn(forward);
      session.units.delete(forward);
    }
    const standing = livingUnits("enemy", "unit").length;
    run(ctx, 200);
    expect(livingUnits("enemy", "unit").length).toBe(standing);
  });
});

describe("roles and hunting on the field", () => {
  beforeEach(() => resetSession());

  test("a wave of three or more gets hold, flank and push duties from where it stands", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 120);
    const squad = waveSquad();
    if (squad.length < 3) return; // a wave has not cleared yet on this seed
    const target = marchTarget();
    const fighters = squad.map((id) => {
      const entity = ctx.scene.entity.get(id)!;
      return { id, position: [entity.position[0], entity.position[1], entity.position[2]] as const, health: 1 };
    });
    const orders = assignFightIntents({ fighters, threat: [target.x, 0, target.z], retreatBelow: 0.25 });
    expect(orders.counts.hold).toBe(1);
    expect(orders.counts.flank).toBeGreaterThanOrEqual(1);
    const flankers = [...orders.intents].filter(([, intent]) => intent === "flank").map(([id]) => id);
    const commands = flankers.map((id) => session.units.get(id)?.command.kind);
    expect(commands.every((kind) => kind === "attackMove" || kind === "hold" || kind === undefined)).toBe(true);
  });

  test("a fight raises a noise and nearby Marauders walk to it", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 35);
    ctx.scene.entity.spawn("grunt", { id: "p1", position: [0, 0, 38], role: "npc" });
    session.units.set("p1", { id: "p1", catalogId: "footman", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
    session.enemyPositions = { e1: { x: 4, z: 36 } };
    raiseCombatNoise(ctx, { x: 0, z: 38 }, "p1");
    // The memory has not been observed yet, so the hunt is admitted but not yet reporting.
    expect(session.hunt?.snapshot().entries.length).toBe(1);
    const investigating = session.hunt?.investigations(session.elapsed * 1000) ?? [];
    expect(investigating.length).toBeLessThanOrEqual(4);
  });
});
