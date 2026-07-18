import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { ENEMY_WAVE_FIRST_DELAY, ENEMY_WAVE_INTERVAL, ENEMY_WAVE_MAX_FIELDED } from "../tuning";
import { livingUnits, resetSession, session } from "../session";
import { nextWaveEta, tickEnemyWaves, waveComposition } from "./director";

/** Boot a real headless context, then stand a Warcamp (enemy) and a keep (player) at either end. */
function boot(): GameContext {
  const definition = defineGameDefinition({ name: "IronholdDirectorTest", multiplayer: "off" });
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

/** Advance the reinforcement clock for `seconds` at a fixed step. */
function run(ctx: GameContext, seconds: number): void {
  for (let t = 0; t < seconds * 2; t += 1) tickEnemyWaves(ctx, 0.5);
}

describe("enemy wave composition", () => {
  test("escalates from an opening pair, adds Reavers, and stays bounded", () => {
    expect(waveComposition(1)).toEqual(["grunt", "grunt"]);
    expect(waveComposition(3).length).toBeGreaterThan(waveComposition(1).length);
    expect(waveComposition(3)).toContain("reaver");
    // Even a very late wave is capped (≤ 6 grunts + 3 Reavers) — no runaway swarm.
    expect(waveComposition(99).length).toBeLessThanOrEqual(9);
  });
});

describe("enemy AI director (real context)", () => {
  beforeEach(() => resetSession());

  test("holds fire through the opening grace period", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 20); // first wave is not due until ENEMY_WAVE_FIRST_DELAY (30s)
    expect(livingUnits("enemy", "unit").length).toBe(0);
    expect(session.enemyWave.sent).toBe(0);
  });

  test("musters a wave that attack-moves the player keep", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 35); // past the grace period
    const marauders = livingUnits("enemy", "unit");
    expect(marauders.length).toBeGreaterThan(0);
    expect(session.enemyWave.sent).toBeGreaterThanOrEqual(1);
    // Every mustered unit marches on the keep, not idle.
    for (const u of marauders) {
      expect(u.command.kind).toBe("attackMove");
      if (u.command.kind === "attackMove") expect(u.command.z).toBeGreaterThan(0); // toward player keep at +z
    }
  });

  test("keeps reinforcing on a cadence", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 110); // grace (30) + one interval (42) both elapse
    expect(session.enemyWave.sent).toBeGreaterThanOrEqual(2);
  });

  test("never fields more than the cap (bounded pressure)", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 2000); // many intervals; the test never kills the mustered units
    expect(livingUnits("enemy", "unit").length).toBeLessThanOrEqual(ENEMY_WAVE_MAX_FIELDED + 9);
  });

  test("HUD countdown reports grace first, then the director beat", () => {
    const ctx = boot();
    seedKeeps(ctx);
    // Before anything runs, the countdown is the full opening grace.
    expect(nextWaveEta()).toBeCloseTo(ENEMY_WAVE_FIRST_DELAY, 5);
    run(ctx, 20); // still inside grace
    expect(nextWaveEta()).toBeCloseTo(ENEMY_WAVE_FIRST_DELAY - 20, 5);
    // Just after the first wave musters, the countdown resets toward the next beat (< interval).
    run(ctx, 15); // t = 35, grace elapsed and one wave sent
    expect(session.enemyWave.sent).toBeGreaterThanOrEqual(1);
    const eta = nextWaveEta();
    expect(eta).toBeGreaterThan(0);
    expect(eta).toBeLessThanOrEqual(ENEMY_WAVE_INTERVAL);
  });

  test("the director cadence clock stays serializable (no closures)", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 80); // past grace and at least one beat
    // Round-trips through structuredClone — proves the clock holds only plain data for save/replication.
    const clone = structuredClone(session.enemyWave);
    expect(clone.director.wave).toBe(session.enemyWave.director.wave);
    expect(clone.sent).toBe(session.enemyWave.sent);
    expect(JSON.parse(JSON.stringify(session.enemyWave.director))).toBeDefined();
  });

  test("razing the Warcamp cuts off reinforcements", () => {
    const ctx = boot();
    seedKeeps(ctx);
    run(ctx, 35);
    expect(livingUnits("enemy", "unit").length).toBeGreaterThan(0);

    // The Warcamp falls — the death handler prunes it from the session.
    session.units.delete("warcamp");
    const standing = livingUnits("enemy", "unit").length;
    run(ctx, 200); // several intervals would have elapsed
    expect(livingUnits("enemy", "unit").length).toBe(standing);
  });
});
