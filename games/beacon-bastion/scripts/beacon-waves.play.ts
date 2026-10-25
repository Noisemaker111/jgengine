/**
 * Beacon Bastion — composed wave, scaling bounty and a boss phase flip, proven headlessly.
 *
 * The run opens the defense for real (`run.begin`) and presses "send wave" the moment the director
 * reports the next one ready, exactly as the HUD button does. It kills one Scout on wave 1 and one on
 * the first composed wave, reading the gold the game itself banks for each; then it crosses the
 * composed boss's first phase threshold and reads the stance the director reports.
 *
 *   bun run simulate beacon-bastion scripts/beacon-waves.play.ts
 *
 * The keep's lives are raised so an undefended run survives to the boss — wave composition and pay
 * are what this proves, not defense balance.
 */

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { BASE_ENTITY_ID } from "../src/game/entities/base/catalog";
import { session } from "../src/game/session";
import { COMPOSE_FROM_WAVE } from "../src/game/waves/composer";
import { bossProfile } from "../src/game/waves/manifest";

let composedWave = 0;
let bountyWave1 = 0;
let bountyComposed = 0;
let killedWave1 = false;
let killedComposed = false;
let bossInstance = "";
let bossUnit = "";
let bossStanceBefore = "";
let bossStanceAfter = "";

function killFirstCreep(ctx: GameContext, catalogId: string): boolean {
  for (const creep of session.creeps.values()) {
    if (creep.catalogId !== catalogId) continue;
    const health = ctx.scene.entity.stats.get(creep.instanceId, "health");
    ctx.scene.entity.effect({
      from: ctx.player.userId,
      to: creep.instanceId,
      effect: "damage",
      via: { amount: (health?.current ?? 1) + 1 },
    });
    return true;
  }
  return false;
}

export default {
  seed: "beacon-waves",
  dt: 1 / 60,
  ticks: 2600,
  setup(ctx) {
    ctx.game.commands.run("run.begin");
    // Twelve waves at real speed is minutes of wall time; the defense supports a game speed, so the
    // director runs at 6x instead of the script asserting against a truncated run.
    ctx.time.setSpeed(6);
    const lives = ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives");
    if (lives !== null) ctx.scene.entity.stats.set(BASE_ENTITY_ID, "lives", { max: 999, current: 999 });
  },
  onTick(ctx) {
    const wave = session.encounter.view().wave;
    if (session.waveReady && !session.encounter.view().done && !session.gameOver) ctx.game.commands.run("wave.send");
    if (wave > composedWave) composedWave = wave;

    if (!killedWave1 && wave === 1 && killFirstCreep(ctx, "raider_scout")) {
      killedWave1 = true;
      bountyWave1 = session.bountyEarned;
    }
    if (!killedComposed && wave >= COMPOSE_FROM_WAVE && killFirstCreep(ctx, "raider_scout")) {
      killedComposed = true;
      bountyComposed = session.bountyEarned - bountyWave1;
    }

    const boss = session.boss;
    if (boss === null || wave < COMPOSE_FROM_WAVE) return;
    if (bossStanceAfter !== "") return;
    if (bossInstance === "") {
      const profile = bossProfile(boss.unitId);
      const health = ctx.scene.entity.stats.get(boss.instanceId, "health");
      if (profile === null || health === null) return;
      bossInstance = boss.instanceId;
      bossUnit = boss.unitId;
      bossStanceBefore = boss.stance;
      // One hit across the first phase threshold (the Warlord turns at 65% health).
      const threshold = profile.phases[1]?.atHealth ?? 0.65;
      ctx.scene.entity.effect({
        from: ctx.player.userId,
        to: boss.instanceId,
        effect: "damage",
        via: { amount: Math.ceil(health.current - health.max * (threshold - 0.05)) },
      });
      return;
    }
    if (boss.instanceId === bossInstance && boss.stance !== bossStanceBefore) bossStanceAfter = boss.stance;
  },
  expect: [
    {
      id: "composed-wave-reached",
      subject: "deepest wave reached",
      read: () => composedWave,
      test: (now) => typeof now === "number" && now >= COMPOSE_FROM_WAVE,
    },
    {
      id: "bounty-scales-with-wave",
      subject: "gold paid for one Scout, first composed wave ÷ wave 1",
      read: () => (bountyWave1 === 0 ? null : Math.round((bountyComposed / bountyWave1) * 100) / 100),
      test: (now) => typeof now === "number" && now > 1.4,
    },
    {
      id: "boss-phase-flipped",
      subject: "composed boss stance",
      read: () => (bossUnit === "" ? null : `${bossUnit}: ${bossStanceBefore} → ${bossStanceAfter}`),
      test: () => bossStanceAfter !== "" && bossStanceAfter !== bossStanceBefore,
    },
  ],
};
