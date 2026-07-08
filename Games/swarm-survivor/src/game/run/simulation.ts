import { advanceSpawnDirector } from "@jgengine/core/ai/spawnDirector";
import { aimToPoint } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { selectAutoTarget } from "@jgengine/core/scene/autoTarget";

import { SPAWN_DIRECTOR_CONFIG, swarmerDef } from "../entities/enemies/catalog";
import {
  PULSE_LANCE_RANGE,
  PULSE_LANCE_SPEED,
  ROTOR_ANGULAR_SPEED,
  ROTOR_HIT_RADIUS,
  quakeRadius,
  rotorBladeCount,
  rotorRadius,
  weaponDamage,
} from "../items/weapons/catalog";
import { LEVELING } from "../progression/curves";
import { UPGRADE_OFFERS } from "../upgrades/catalog";
import {
  CONTACT_RADIUS,
  GEM_COLLECT_RADIUS,
  GEM_PULL_SPEED,
  MAGNET_RADIUS_PER_STACK,
  SPAWN_RING_RADIUS,
  VITALITY_HEALTH_BONUS,
  WIN_DURATION_SECONDS,
  getRunState,
  type RunState,
} from "./state";

const XP_GEM_BASE_TYPE = "xp_gem";
const HIT_EFFECT = "hit";

function gemRarity(value: number): string {
  if (value >= 20) return "epic";
  if (value >= 6) return "rare";
  if (value >= 3) return "uncommon";
  return "common";
}

function spawnRingPoint(ctx: GameContext, run: RunState): [number, number, number] {
  const angle = run.rng() * Math.PI * 2;
  const x = Math.cos(angle) * SPAWN_RING_RADIUS;
  const z = Math.sin(angle) * SPAWN_RING_RADIUS;
  return [x, ctx.world.groundHeightAt(x, z), z];
}

function facing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function advanceSpawning(ctx: GameContext, run: RunState, dt: number): void {
  const alive = ctx.scene.entity.list().filter((entity) => swarmerDef(entity.name) !== null).length;
  const step = advanceSpawnDirector(SPAWN_DIRECTOR_CONFIG, run.spawn, dt, { alive, players: 1 });
  run.spawn = step.state;
  for (const request of step.spawns) {
    if (swarmerDef(request.entryId) === null) continue;
    ctx.scene.entity.spawn(request.entryId, { position: spawnRingPoint(ctx, run) });
  }
}

function advanceEnemies(ctx: GameContext, run: RunState, dt: number): void {
  const playerId = ctx.player.userId;
  const player = ctx.scene.entity.get(playerId);
  if (player === null) return;
  const now = ctx.time.now();
  for (const enemy of ctx.scene.entity.list()) {
    const def = swarmerDef(enemy.name);
    if (def === null) continue;
    const next = ctx.scene.entity.moveToward(enemy.id, playerId, { speed: def.walkSpeed, dt });
    if (next !== null) {
      const grounded: readonly [number, number, number] = [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]];
      ctx.scene.entity.setPose(enemy.id, {
        position: grounded,
        rotationY: facing(enemy.position[0], enemy.position[2], player.position[0], player.position[2]),
      });
    }
    const distance = ctx.scene.entity.distance(enemy.id, playerId);
    if (distance === null || distance > CONTACT_RADIUS) continue;
    const readyAt = run.enemyNextHitAt.get(enemy.id) ?? 0;
    if (now < readyAt) continue;
    run.enemyNextHitAt.set(enemy.id, now + def.contactIntervalSeconds);
    ctx.scene.entity.effect({ from: enemy.id, to: playerId, effect: HIT_EFFECT, via: { amount: def.contactDamage } });
  }
}

function hostileCandidates(ctx: GameContext): string[] {
  return ctx.scene.entity
    .list()
    .filter((entity) => swarmerDef(entity.name) !== null)
    .map((entity) => entity.id);
}

function firePulseLance(ctx: GameContext, run: RunState, playerId: string, playerPos: readonly [number, number, number], enemies: readonly string[]): void {
  const state = run.weaponKit.state("pulseLance");
  if (state === null || !state.ready) return;
  const targetId = selectAutoTarget("nearest", playerId, {
    candidates: () => enemies,
    distance: (from, to) => ctx.scene.entity.distance(from, to),
  });
  if (targetId === null) return;
  const target = ctx.scene.entity.get(targetId);
  if (target === null) return;
  const dx = target.position[0] - playerPos[0];
  const dz = target.position[2] - playerPos[2];
  const distance = Math.hypot(dx, dz);
  if (distance > PULSE_LANCE_RANGE) return;
  run.weaponKit.cast("pulseLance");
  const level = run.weapons.pulseLance.level;
  const damage = weaponDamage("pulseLance", level) * run.damageMultiplier;
  const aim = aimToPoint(playerPos, target.position);
  const shotId = ctx.scene.entity.fireProjectile({ from: playerId, via: { amount: damage }, aim, effect: HIT_EFFECT });
  const travelSeconds = Math.min(1.1, Math.max(0.08, distance / PULSE_LANCE_SPEED));
  run.bolts.push({ id: run.nextFxId(), origin: playerPos, target: target.position, firedAt: ctx.time.now(), travelSeconds });
  ctx.time.after(travelSeconds, () => {
    ctx.scene.entity.settleProjectile(shotId);
  });
}

function fireRotorBlades(ctx: GameContext, run: RunState, playerId: string, playerPos: readonly [number, number, number], enemies: readonly string[]): void {
  const state = run.weaponKit.state("rotorBlades");
  if (state === null || !state.ready) return;
  run.weaponKit.cast("rotorBlades");
  const level = run.weapons.rotorBlades.level;
  const damage = weaponDamage("rotorBlades", level) * run.damageMultiplier;
  const blades = rotorBladeCount(level);
  const radius = rotorRadius(level);
  const angle = ctx.time.now() * ROTOR_ANGULAR_SPEED;
  const alreadyHit = new Set<string>();
  for (let blade = 0; blade < blades; blade += 1) {
    const theta = angle + (blade * Math.PI * 2) / blades;
    const bladePos: readonly [number, number, number] = [
      playerPos[0] + Math.cos(theta) * radius,
      playerPos[1],
      playerPos[2] + Math.sin(theta) * radius,
    ];
    for (const instanceId of ctx.scene.entity.inRadius(bladePos, ROTOR_HIT_RADIUS, (id) => enemies.includes(id))) {
      if (alreadyHit.has(instanceId)) continue;
      alreadyHit.add(instanceId);
      ctx.scene.entity.effect({ from: playerId, to: instanceId, effect: HIT_EFFECT, via: { amount: damage } });
    }
  }
}

function fireQuakePulse(ctx: GameContext, run: RunState, playerId: string, playerPos: readonly [number, number, number]): void {
  const state = run.weaponKit.state("quakePulse");
  if (state === null || !state.ready) return;
  run.weaponKit.cast("quakePulse");
  const level = run.weapons.quakePulse.level;
  const damage = weaponDamage("quakePulse", level) * run.damageMultiplier;
  const radius = quakeRadius(level);
  ctx.scene.entity.effect({ from: playerId, effect: HIT_EFFECT, via: { amount: damage }, at: playerPos, radius, falloff: "linear" });
  run.pulses.push({ id: run.nextFxId(), at: playerPos, firedAt: ctx.time.now(), durationSeconds: 0.55, maxRadius: radius });
}

function fireWeapons(ctx: GameContext, run: RunState, dt: number): void {
  run.weaponKit.tick(dt);
  const playerId = ctx.player.userId;
  const player = ctx.scene.entity.get(playerId);
  if (player === null) return;
  const enemies = hostileCandidates(ctx);
  firePulseLance(ctx, run, playerId, player.position, enemies);
  fireRotorBlades(ctx, run, playerId, player.position, enemies);
  fireQuakePulse(ctx, run, playerId, player.position);
}

function onLevelUp(ctx: GameContext, run: RunState, level: number): void {
  ctx.game.events.emit("stat.levelUp", { userId: ctx.player.userId, stat: "level", level });
  run.levelUpQueue += 1;
  maybeOpenDraft(ctx, run);
}

function maybeOpenDraft(ctx: GameContext, run: RunState): void {
  if (run.pendingOffers !== null || run.levelUpQueue <= 0 || run.outcome !== "playing") return;
  run.levelUpQueue -= 1;
  run.pendingOffers = run.draft.present(3);
  ctx.time.pause();
  run.notify();
}

function advancePickups(ctx: GameContext, run: RunState, dt: number): void {
  const playerId = ctx.player.userId;
  if (ctx.scene.entity.get(playerId) === null) return;
  for (const record of ctx.scene.worldItem.list()) {
    if (record.baseType !== XP_GEM_BASE_TYPE) continue;
    const distance = ctx.scene.entity.distance(record.instanceId, playerId);
    if (distance === null) continue;
    if (distance <= GEM_COLLECT_RADIUS) {
      ctx.scene.entity.despawn(record.instanceId);
      LEVELING.grantXp(
        {
          get: (userId, statId) => ctx.scene.entity.stats.get(userId, statId),
          set: (userId, statId, patch) => ctx.scene.entity.stats.set(userId, statId, patch),
        },
        playerId,
        record.count,
        (level) => onLevelUp(ctx, run, level),
      );
      continue;
    }
    if (distance > run.magnetRadius) continue;
    const next = ctx.scene.entity.moveToward(record.instanceId, playerId, { speed: GEM_PULL_SPEED, dt });
    if (next !== null) {
      const grounded: readonly [number, number, number] = [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]];
      ctx.scene.entity.setPose(record.instanceId, { position: grounded });
    }
  }
}

function pruneFx(ctx: GameContext, run: RunState): void {
  const now = ctx.time.now();
  run.bolts = run.bolts.filter((bolt) => now - bolt.firedAt <= bolt.travelSeconds + 0.15);
  run.pulses = run.pulses.filter((pulse) => now - pulse.firedAt <= pulse.durationSeconds + 0.05);
}

export function chooseUpgrade(ctx: GameContext, run: RunState, offerId: string): void {
  if (run.pendingOffers === null) return;
  if (!run.draft.choose(offerId)) return;
  applyUpgrade(ctx, run, offerId);
  run.pendingOffers = null;
  ctx.time.play();
  run.notify();
  maybeOpenDraft(ctx, run);
}

function applyUpgrade(ctx: GameContext, run: RunState, offerId: string): void {
  const offer = UPGRADE_OFFERS.find((entry) => entry.id === offerId);
  const data = offer?.data;
  if (data === undefined) return;
  switch (data.kind) {
    case "weapon": {
      const stacks = run.draft.stack().count(offerId);
      run.weapons[data.weapon].level = 1 + stacks;
      run.rebuildWeaponKit();
      return;
    }
    case "vitality": {
      const current = ctx.scene.entity.stats.get(ctx.player.userId, "health");
      const max = (current?.max ?? 0) + VITALITY_HEALTH_BONUS;
      const health = (current?.current ?? 0) + VITALITY_HEALTH_BONUS;
      ctx.scene.entity.stats.set(ctx.player.userId, "health", { max, current: health });
      return;
    }
    case "magnet": {
      run.magnetRadius += MAGNET_RADIUS_PER_STACK;
      return;
    }
    case "adrenaline": {
      run.damageMultiplier = run.draft.stack().total("damageMultiplier").multiply ?? 1;
      return;
    }
  }
}

export function registerRunEvents(ctx: GameContext): void {
  const run = getRunState(ctx);
  ctx.game.leaderboard.track({ stat: "kills", scope: "profile" });
  ctx.player.stats.setBase("damageMultiplier", 1);
  ctx.game.events.on("entity.died", (event) => {
    if (event.instanceId === ctx.player.userId) {
      if (run.outcome === "playing") {
        run.outcome = "lost";
        run.notify();
      }
      return;
    }
    if (event.reason.kind !== "player_kill") return;
    const def = swarmerDef(event.catalogId);
    if (def === null) return;
    run.kills += 1;
    ctx.game.leaderboard.increment(ctx.player.userId, "kills", { scope: "profile" });
    ctx.scene.worldItem.spawn({
      itemId: XP_GEM_BASE_TYPE,
      baseType: XP_GEM_BASE_TYPE,
      position: event.position,
      count: def.xpValue,
      rarity: gemRarity(def.xpValue),
    });
  });
}

export function tickSimulation(ctx: GameContext, dt: number): void {
  const run = getRunState(ctx);
  if (run.outcome !== "playing" || run.pendingOffers !== null || dt <= 0) return;
  advanceSpawning(ctx, run, dt);
  advanceEnemies(ctx, run, dt);
  fireWeapons(ctx, run, dt);
  advancePickups(ctx, run, dt);
  pruneFx(ctx, run);
  if (ctx.time.now() >= WIN_DURATION_SECONDS) {
    run.outcome = "won";
    run.notify();
  }
}
