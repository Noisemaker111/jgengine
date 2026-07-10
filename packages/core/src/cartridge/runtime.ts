import { advanceSpawnDirector, createSpawnDirectorState, type SpawnDirectorState } from "../ai/spawnDirector";
import { createAbilityKit, type AbilityKit } from "../combat/abilityKit";
import type { GameLoop } from "../game/defineGame";
import { leveling, type LevelingTrack } from "../game/progression";
import { createRunDraft, type RunDraft, type RunModifierOffer } from "../game/runDraft";
import { aimToPoint } from "../input/pointer";
import { seededRng } from "../item/affix";
import type { GameContext, GameContextContent, GameContextEntityEntry } from "../runtime/gameContext";
import { selectAutoTarget } from "../scene/autoTarget";

import {
  HIT_EFFECT,
  XP_GEM_BASE_TYPE,
  leveled,
  type BoltFx,
  type CartridgePhase,
  type CartridgeRun,
  type CartridgeSpec,
  type CartridgeWeapon,
  type PulseFx,
} from "./spec";

export interface CartridgeRuntime {
  content: GameContextContent;
  loop: GameLoop<GameContext>;
  run(ctx: GameContext): CartridgeRun;
  weaponKit(ctx: GameContext): AbilityKit;
  chooseUpgrade(ctx: GameContext, offerId: string): void;
  begin(ctx: GameContext): void;
  reset(ctx: GameContext): void;
  spec: CartridgeSpec;
}

interface SeededRunState {
  rng(): number;
  spawn: SpawnDirectorState;
  weaponLevels: Record<string, number>;
  kit: AbilityKit;
  fields: Record<string, number>;
  enemyNextHitAt: Map<string, number>;
  phase: CartridgePhase;
  playingSeconds: number;
  countdownRemaining: number;
  kills: number;
  levelUpQueue: number;
  draft: RunDraft<string, never>;
  pendingOffers: RunModifierOffer<string, never>[] | null;
  bolts: BoltFx[];
  pulses: PulseFx[];
  fxCounter: number;
}

interface InternalRun extends SeededRunState {
  listeners: Set<() => void>;
  disposeEvents?: () => void;
  view: CartridgeRun;
}

function gemRarity(spec: CartridgeSpec, value: number): string {
  for (const [threshold, rarity] of spec.xpGems.rarityThresholds) {
    if (value >= threshold) return rarity;
  }
  return spec.xpGems.defaultRarity;
}

function facing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function buildKit(spec: CartridgeSpec, levels: Record<string, number>): AbilityKit {
  return createAbilityKit(
    Object.entries(spec.weapons).map(([id, weapon]) => ({
      id,
      cooldownMs: leveled(weapon.cooldownMs, levels[id] ?? 1),
    })),
  );
}

function compileEntities(spec: CartridgeSpec): Record<string, GameContextEntityEntry> {
  const out: Record<string, GameContextEntityEntry> = {
    [spec.player.kind]: {
      role: "player",
      movement: { walkSpeed: spec.player.walkSpeed },
      stats: {
        health: { max: spec.player.health, min: 0 },
        xp: { max: 1, min: 0, current: 0 },
        level: { max: spec.progression.maxLevel, min: 1, current: 1 },
      },
      receive: { hit: { order: ["health"] } },
    },
  };
  for (const [id, enemy] of Object.entries(spec.enemies)) {
    out[id] = {
      role: "enemy",
      movement: { walkSpeed: enemy.walkSpeed },
      stats: { health: { max: enemy.health, min: 0 } },
      receive: { hit: { order: ["health"] } },
    };
  }
  return out;
}

export function createCartridge(spec: CartridgeSpec): CartridgeRuntime {
  const track: LevelingTrack = leveling({ xpForLevel: spec.progression.xp, maxLevel: spec.progression.maxLevel });
  const entities = compileEntities(spec);
  const runs = new WeakMap<GameContext, InternalRun>();

  function initialPhase(): CartridgePhase {
    if (spec.flow?.start === "gate") return "start";
    if ((spec.flow?.countdownSeconds ?? 0) > 0) return "countdown";
    return "playing";
  }

  function seededState(): SeededRunState {
    const seed = spec.seed ?? "cartridge";
    const weaponLevels: Record<string, number> = {};
    for (const id of Object.keys(spec.weapons)) weaponLevels[id] = 1;
    const offers: RunModifierOffer<string, never>[] = spec.progression.draft.upgrades.map((upgrade) => ({
      id: upgrade.id,
      label: upgrade.label,
      weight: upgrade.weight,
      maxStacks: upgrade.maxStacks,
    }));
    return {
      rng: seededRng(seed),
      spawn: createSpawnDirectorState(spec.spawning.director),
      weaponLevels,
      kit: buildKit(spec, weaponLevels),
      fields: { ...spec.fields },
      enemyNextHitAt: new Map(),
      phase: initialPhase(),
      playingSeconds: 0,
      countdownRemaining: spec.flow?.countdownSeconds ?? 0,
      kills: 0,
      levelUpQueue: 0,
      draft: createRunDraft({ offers, rng: seededRng(`${seed}-draft`) }),
      pendingOffers: null,
      bolts: [],
      pulses: [],
      fxCounter: 0,
    };
  }

  function createRun(): InternalRun {
    const run: InternalRun = {
      ...seededState(),
      listeners: new Set<() => void>(),
      view: {
        get phase() {
          return run.phase;
        },
        get playingSeconds() {
          return run.playingSeconds;
        },
        get countdownRemaining() {
          return run.countdownRemaining;
        },
        get kills() {
          return run.kills;
        },
        weaponLevel: (weaponId) => run.weaponLevels[weaponId] ?? 1,
        field: (name) => run.fields[name] ?? 0,
        get pendingOffers() {
          if (run.pendingOffers === null) return null;
          return run.pendingOffers.map((offer) => ({ id: offer.id, label: offer.label ?? offer.id }));
        },
        get bolts() {
          return run.bolts;
        },
        get pulses() {
          return run.pulses;
        },
        subscribe(listener) {
          run.listeners.add(listener);
          return () => run.listeners.delete(listener);
        },
      },
    };
    return run;
  }

  function getRun(ctx: GameContext): InternalRun {
    let existing = runs.get(ctx);
    if (existing === undefined) {
      existing = createRun();
      runs.set(ctx, existing);
    }
    return existing;
  }

  function notify(run: InternalRun): void {
    for (const listener of run.listeners) listener();
  }

  function damageMultiplier(run: InternalRun): number {
    return run.fields["damageMultiplier"] ?? 1;
  }

  function spawnPoint(ctx: GameContext, run: InternalRun): readonly [number, number, number] {
    const placement = spec.spawning.placement;
    if (placement.kind === "custom") return placement.position(ctx, run.view);
    const angle = run.rng() * Math.PI * 2;
    const x = Math.cos(angle) * placement.radius;
    const z = Math.sin(angle) * placement.radius;
    return [x, ctx.world.groundHeightAt(x, z), z];
  }

  function advanceSpawning(ctx: GameContext, run: InternalRun, dt: number): void {
    const alive = ctx.scene.entity.list().filter((entity) => spec.enemies[entity.name] !== undefined).length;
    const step = advanceSpawnDirector(spec.spawning.director, run.spawn, dt, { alive, players: 1 });
    run.spawn = step.state;
    for (const request of step.spawns) {
      if (spec.enemies[request.entryId] === undefined) continue;
      ctx.scene.entity.spawn(request.entryId, { position: spawnPoint(ctx, run) });
    }
  }

  function advanceEnemies(ctx: GameContext, run: InternalRun, dt: number): void {
    const playerId = ctx.player.userId;
    const player = ctx.scene.entity.get(playerId);
    if (player === null) return;
    const now = ctx.time.now();
    for (const enemy of ctx.scene.entity.list()) {
      const def = spec.enemies[enemy.name];
      if (def === undefined) continue;
      const next =
        def.behavior === "none" ? null : ctx.scene.entity.moveToward(enemy.id, playerId, { speed: def.walkSpeed, dt });
      if (next !== null) {
        const grounded: readonly [number, number, number] = [
          next[0],
          ctx.world.groundHeightAt(next[0], next[2]),
          next[2],
        ];
        ctx.scene.entity.setPose(enemy.id, {
          position: grounded,
          rotationY: facing(enemy.position[0], enemy.position[2], player.position[0], player.position[2]),
        });
      }
      const distance = ctx.scene.entity.distance(enemy.id, playerId);
      if (distance === null || distance > spec.combat.contactRadius) continue;
      const readyAt = run.enemyNextHitAt.get(enemy.id) ?? 0;
      if (now < readyAt) continue;
      run.enemyNextHitAt.set(enemy.id, now + def.contact.intervalSeconds);
      ctx.scene.entity.effect({ from: enemy.id, to: playerId, effect: HIT_EFFECT, via: { amount: def.contact.damage } });
    }
  }

  function enemyIds(ctx: GameContext): string[] {
    return ctx.scene.entity
      .list()
      .filter((entity) => spec.enemies[entity.name] !== undefined)
      .map((entity) => entity.id);
  }

  function fireProjectile(
    ctx: GameContext,
    run: InternalRun,
    weaponId: string,
    weapon: Extract<CartridgeWeapon, { kind: "projectile" }>,
    playerId: string,
    playerPos: readonly [number, number, number],
    enemies: readonly string[],
  ): void {
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
    if (distance > weapon.range) return;
    run.kit.cast(weaponId);
    const level = run.weaponLevels[weaponId] ?? 1;
    const damage = leveled(weapon.damage, level) * damageMultiplier(run);
    const aim = aimToPoint(playerPos, target.position);
    const shotId = ctx.scene.entity.fireProjectile({ from: playerId, via: { amount: damage }, aim, effect: HIT_EFFECT });
    const travelSeconds = Math.min(1.1, Math.max(0.08, distance / weapon.speed));
    run.fxCounter += 1;
    run.bolts.push({
      id: run.fxCounter,
      weaponId,
      origin: playerPos,
      target: target.position,
      firedAt: ctx.time.now(),
      travelSeconds,
    });
    ctx.time.after(travelSeconds, () => {
      ctx.scene.entity.settleProjectile(shotId);
    });
  }

  function fireOrbit(
    ctx: GameContext,
    run: InternalRun,
    weaponId: string,
    weapon: Extract<CartridgeWeapon, { kind: "orbit" }>,
    playerId: string,
    playerPos: readonly [number, number, number],
    enemies: readonly string[],
  ): void {
    run.kit.cast(weaponId);
    const level = run.weaponLevels[weaponId] ?? 1;
    const damage = leveled(weapon.damage, level) * damageMultiplier(run);
    const blades = leveled(weapon.blades, level);
    const radius = leveled(weapon.radius, level);
    const angle = ctx.time.now() * weapon.angularSpeed;
    const alreadyHit = new Set<string>();
    for (let blade = 0; blade < blades; blade += 1) {
      const theta = angle + (blade * Math.PI * 2) / blades;
      const bladePos: readonly [number, number, number] = [
        playerPos[0] + Math.cos(theta) * radius,
        playerPos[1],
        playerPos[2] + Math.sin(theta) * radius,
      ];
      for (const instanceId of ctx.scene.entity.inRadius(bladePos, weapon.hitRadius, (id) => enemies.includes(id))) {
        if (alreadyHit.has(instanceId)) continue;
        alreadyHit.add(instanceId);
        ctx.scene.entity.effect({ from: playerId, to: instanceId, effect: HIT_EFFECT, via: { amount: damage } });
      }
    }
  }

  function firePulse(
    ctx: GameContext,
    run: InternalRun,
    weaponId: string,
    weapon: Extract<CartridgeWeapon, { kind: "pulse" }>,
    playerId: string,
    playerPos: readonly [number, number, number],
  ): void {
    run.kit.cast(weaponId);
    const level = run.weaponLevels[weaponId] ?? 1;
    const damage = leveled(weapon.damage, level) * damageMultiplier(run);
    const radius = leveled(weapon.radius, level);
    ctx.scene.entity.effect({ from: playerId, effect: HIT_EFFECT, via: { amount: damage }, at: playerPos, radius, falloff: "linear" });
    run.fxCounter += 1;
    run.pulses.push({
      id: run.fxCounter,
      weaponId,
      at: playerPos,
      firedAt: ctx.time.now(),
      durationSeconds: weapon.durationSeconds,
      maxRadius: radius,
    });
  }

  function fireWeapons(ctx: GameContext, run: InternalRun, dt: number): void {
    run.kit.tick(dt);
    const playerId = ctx.player.userId;
    const player = ctx.scene.entity.get(playerId);
    if (player === null) return;
    const enemies = enemyIds(ctx);
    for (const [weaponId, weapon] of Object.entries(spec.weapons)) {
      const state = run.kit.state(weaponId);
      if (state === null || !state.ready) continue;
      if (weapon.kind === "projectile") {
        fireProjectile(ctx, run, weaponId, weapon, playerId, player.position, enemies);
      } else if (weapon.kind === "orbit") {
        fireOrbit(ctx, run, weaponId, weapon, playerId, player.position, enemies);
      } else if (weapon.kind === "pulse") {
        firePulse(ctx, run, weaponId, weapon, playerId, player.position);
      } else {
        run.kit.cast(weaponId);
        const level = run.weaponLevels[weaponId] ?? 1;
        weapon.fire(ctx, run.view, {
          weaponId,
          level,
          damage: leveled(weapon.damage, level) * damageMultiplier(run),
          playerId,
          playerPosition: player.position,
          enemyIds: enemies,
          dt,
        });
      }
    }
  }

  function maybeOpenDraft(ctx: GameContext, run: InternalRun): void {
    if (run.pendingOffers !== null || run.levelUpQueue <= 0 || run.phase !== "playing") return;
    run.levelUpQueue -= 1;
    run.pendingOffers = run.draft.present(spec.progression.draft.choices);
    ctx.time.pause();
    notify(run);
  }

  function onLevelUp(ctx: GameContext, run: InternalRun, level: number): void {
    ctx.game.events.emit("stat.levelUp", { userId: ctx.player.userId, stat: "level", level });
    run.levelUpQueue += 1;
    maybeOpenDraft(ctx, run);
  }

  function advancePickups(ctx: GameContext, run: InternalRun, dt: number): void {
    const playerId = ctx.player.userId;
    if (ctx.scene.entity.get(playerId) === null) return;
    const magnetRadius = run.fields["magnetRadius"] ?? 0;
    for (const record of ctx.scene.worldItem.list()) {
      if (record.baseType !== XP_GEM_BASE_TYPE) continue;
      const distance = ctx.scene.entity.distance(record.instanceId, playerId);
      if (distance === null) continue;
      if (distance <= spec.xpGems.collectRadius) {
        ctx.scene.worldItem.consume(record.instanceId);
        track.grantXp(
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
      if (distance > magnetRadius) continue;
      const next = ctx.scene.entity.moveToward(record.instanceId, playerId, { speed: spec.xpGems.pullSpeed, dt });
      if (next !== null) {
        const grounded: readonly [number, number, number] = [
          next[0],
          ctx.world.groundHeightAt(next[0], next[2]),
          next[2],
        ];
        ctx.scene.entity.setPose(record.instanceId, { position: grounded });
      }
    }
  }

  function pruneFx(ctx: GameContext, run: InternalRun): void {
    const now = ctx.time.now();
    run.bolts = run.bolts.filter((bolt) => now - bolt.firedAt <= bolt.travelSeconds + 0.15);
    run.pulses = run.pulses.filter((pulse) => now - pulse.firedAt <= pulse.durationSeconds + 0.05);
  }

  function applyUpgrade(ctx: GameContext, run: InternalRun, offerId: string): void {
    const upgrade = spec.progression.draft.upgrades.find((entry) => entry.id === offerId);
    if (upgrade === undefined) return;
    const stacks = run.draft.stack().count(offerId);
    const effect = upgrade.effect;
    switch (effect.kind) {
      case "weaponLevel": {
        run.weaponLevels[effect.weapon] = 1 + stacks;
        run.kit = buildKit(spec, run.weaponLevels);
        return;
      }
      case "statBonus": {
        const current = ctx.scene.entity.stats.get(ctx.player.userId, effect.stat);
        const max = (current?.max ?? 0) + effect.amount;
        const value = (current?.current ?? 0) + effect.amount;
        ctx.scene.entity.stats.set(ctx.player.userId, effect.stat, { max, current: value });
        return;
      }
      case "fieldAdd": {
        const base = spec.fields?.[effect.field] ?? 0;
        run.fields[effect.field] = base + effect.amount * stacks;
        return;
      }
      case "fieldMultiply": {
        const base = spec.fields?.[effect.field] ?? 1;
        run.fields[effect.field] = base * effect.factor ** stacks;
        return;
      }
      case "custom": {
        effect.apply(ctx, run.view, stacks);
        return;
      }
    }
  }

  function chooseUpgrade(ctx: GameContext, offerId: string): void {
    const run = getRun(ctx);
    if (run.pendingOffers === null) return;
    if (!run.draft.choose(offerId)) return;
    applyUpgrade(ctx, run, offerId);
    run.pendingOffers = null;
    ctx.time.play();
    notify(run);
    maybeOpenDraft(ctx, run);
  }

  function registerEvents(ctx: GameContext): void {
    const run = getRun(ctx);
    if (spec.rules.killLeaderboardStat !== undefined) {
      ctx.game.leaderboard.track({ stat: spec.rules.killLeaderboardStat, scope: "profile" });
    }
    run.disposeEvents?.();
    run.disposeEvents = ctx.game.events.on("entity.died", (event) => {
      if (event.instanceId === ctx.player.userId) {
        if (spec.rules.lose?.kind === "playerDeath" && run.phase === "playing") {
          run.phase = "lost";
          notify(run);
        }
        return;
      }
      if (event.reason.kind !== "player_kill") return;
      const def = spec.enemies[event.catalogId];
      if (def === undefined) return;
      run.kills += 1;
      if (spec.rules.killLeaderboardStat !== undefined) {
        ctx.game.leaderboard.increment(ctx.player.userId, spec.rules.killLeaderboardStat, { scope: "profile" });
      }
      ctx.scene.worldItem.spawn({
        itemId: XP_GEM_BASE_TYPE,
        baseType: XP_GEM_BASE_TYPE,
        position: event.position,
        count: def.xp,
        rarity: gemRarity(spec, def.xp),
      });
    });
  }

  function checkOutcome(ctx: GameContext, run: InternalRun): void {
    const win = spec.rules.win;
    if (win !== undefined) {
      const won = win.kind === "survive" ? run.playingSeconds >= win.seconds : win.check(ctx, run.view);
      if (won) {
        run.phase = "won";
        notify(run);
        return;
      }
    }
    const lose = spec.rules.lose;
    if (lose?.kind === "custom" && lose.check(ctx, run.view)) {
      run.phase = "lost";
      notify(run);
    }
  }

  function begin(ctx: GameContext): void {
    const run = getRun(ctx);
    if (run.phase !== "start") return;
    run.phase = run.countdownRemaining > 0 ? "countdown" : "playing";
    notify(run);
  }

  function despawnCartridgeEntities(ctx: GameContext): void {
    for (const entity of ctx.scene.entity.list()) {
      if (spec.enemies[entity.name] !== undefined) ctx.scene.entity.despawn(entity.id);
    }
    for (const record of ctx.scene.worldItem.list()) {
      if (record.baseType === XP_GEM_BASE_TYPE) ctx.scene.entity.despawn(record.instanceId);
    }
  }

  function reset(ctx: GameContext): void {
    const run = getRun(ctx);
    Object.assign(run, seededState());
    despawnCartridgeEntities(ctx);
    if (ctx.scene.entity.get(ctx.player.userId) === null) {
      ctx.scene.entity.spawn(spec.player.kind, {
        id: ctx.player.userId,
        position: spec.player.spawnAt ?? [0, 0, 0],
      });
    }
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: spec.player.health, current: spec.player.health });
    ctx.scene.entity.stats.set(ctx.player.userId, "xp", { max: track.xpForLevel(1), current: 0 });
    ctx.scene.entity.stats.set(ctx.player.userId, "level", { current: 1 });
    ctx.scene.entity.setPose(ctx.player.userId, { position: spec.player.spawnAt ?? [0, 0, 0] });
    ctx.time.play();
    notify(run);
  }

  function tick(ctx: GameContext, dt: number): void {
    const run = getRun(ctx);
    if (dt <= 0 || run.pendingOffers !== null) return;
    if (run.phase === "countdown") {
      run.countdownRemaining -= dt;
      if (run.countdownRemaining <= 0) {
        run.countdownRemaining = 0;
        run.phase = "playing";
      }
      notify(run);
      return;
    }
    if (run.phase !== "playing") return;
    run.playingSeconds += dt;
    advanceSpawning(ctx, run, dt);
    advanceEnemies(ctx, run, dt);
    fireWeapons(ctx, run, dt);
    advancePickups(ctx, run, dt);
    pruneFx(ctx, run);
    for (const system of spec.systems ?? []) system(ctx, run.view, dt);
    checkOutcome(ctx, run);
  }

  const loop: GameLoop<GameContext> = {
    onInit(ctx) {
      registerEvents(ctx);
      if (spec.flow?.restart === true && !ctx.game.commands.has("restart")) {
        ctx.game.commands.define("restart", {
          apply(state) {
            reset(ctx);
            return state;
          },
        });
      }
    },
    onNewPlayer(ctx) {
      ctx.scene.entity.spawn(spec.player.kind, {
        id: ctx.player.userId,
        position: spec.player.spawnAt ?? [0, 0, 0],
      });
      ctx.scene.entity.stats.set(ctx.player.userId, "xp", { max: track.xpForLevel(1), current: 0 });
      ctx.scene.entity.stats.set(ctx.player.userId, "level", { current: 1 });
    },
    onTick(ctx, dt) {
      tick(ctx, dt);
    },
  };

  return {
    content: { entityById: (id) => entities[id] ?? null },
    loop,
    run: (ctx) => getRun(ctx).view,
    weaponKit: (ctx) => getRun(ctx).kit,
    chooseUpgrade,
    begin,
    reset,
    spec,
  };
}
