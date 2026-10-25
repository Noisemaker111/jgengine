import { createWaveCountdown, type WaveCountdown } from "@jgengine/core/ai/director/waveCountdown";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { selectRules } from "@jgengine/core/game/ruleSelection";
import { createMedalBoard, type MedalBoard, type MedalBoardState } from "@jgengine/core/progression/medalBoard";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { defineStore } from "@jgengine/core/store/defineStore";

import { earn, spend } from "../cash";
import { activeCharacter } from "../characters";
import { overrideSurface } from "../combat/surfaceOverride";
import {
  abortFrontRun,
  FRONT_SITE,
  frontEverCleared,
  frontUnitIds,
  isFrontUnit,
  spawnFrontUnit,
  startFrontRun,
} from "../encounters/front";
import { FRONT_LEAVE_RADIUS } from "../encounters/waves";
import { enemyById, levelDamageMult, levelXpFor } from "../entities/enemies/catalog";
import { clearEnemyPower, setEnemyPower } from "../entities/enemies/behavior";
import { grantXp } from "../progression/curves";
import {
  MEDAL_REWARDS,
  RIFT_BOARD,
  RIFT_INTERMISSION_SECONDS,
  RIFT_MUTATORS,
  RIFT_TIER_COUNT,
  mutatorById,
  mutatorCountFor,
  riftEventId,
  riftScaling,
  romanTier,
  type RiftMutatorEffect,
  type RiftScaling,
} from "./tiers";


/** Cores it costs to re-roll a tier's mutators. */
export const RIFT_REROLL_CORES = 4;
/** Seconds the reclaimer can stand outside the wreck's ring before the run is forfeit. */
export const RIFT_LEAVE_GRACE_SECONDS = 8;
const XP_PER_CLEAR = 300;
/** From this tier up, the Foreman always drops a legendary. */
export const RIFT_LEGENDARY_TIER = 4;

export type RiftPhase = "running" | "intermission" | "won" | "lost";

export interface RiftRunView {
  tier: number;
  phase: RiftPhase;
  wave: number;
  elapsed: number;
  mutators: readonly string[];
  enemyLevel: number;
  /** Seconds left on the intermission clock, while one runs. */
  countdown: number | null;
  countdownTotal: number;
  /** Set once the run ends. */
  medal?: string | null;
  newBest?: boolean;
  newMedals?: readonly string[];
  reason?: string;
  cash?: number;
  cores?: number;
}

export interface RiftState {
  /** The ladder opens for good once the plain front has been fought to the end. */
  unlocked: boolean;
  board: MedalBoardState;
  /** How many times each tier's mutators were re-rolled; the roll is seeded from this. */
  rerolls: Record<string, number>;
  selected: number;
  run: RiftRunView | null;
}

export const riftStore = defineStore<RiftState>("scrap.overdrive", () => ({
  unlocked: false,
  board: { best: {} },
  rerolls: {},
  selected: 1,
  run: null,
}));

export const riftTerminalOpenStore = defineStore<boolean>("scrap.overdrive.terminal", false);

interface RiftUnit {
  level: number;
  boss: boolean;
  maxHealth: number;
  regenCarry: number;
}

interface RiftRuntime {
  board: MedalBoard | null;
  boardFor: MedalBoardState | null;
  clock: WaveCountdown;
  release: boolean;
  units: Map<string, RiftUnit>;
  effect: Required<Pick<RiftMutatorEffect, "health" | "damage" | "interval" | "speed" | "cash" | "shieldRegen">> & RiftMutatorEffect;
  scaling: RiftScaling | null;
  outside: number;
  twinning: boolean;
  rng: () => number;
}

const runtimeOf = perContext(
  (): RiftRuntime => ({
    board: null,
    boardFor: null,
    clock: createWaveCountdown({ intermission: RIFT_INTERMISSION_SECONDS }),
    release: false,
    units: new Map(),
    effect: neutralEffect(),
    scaling: null,
    outside: 0,
    twinning: false,
    rng: seededRng("scrap-overdrive"),
  }),
);

function neutralEffect(): RiftRuntime["effect"] {
  return { health: 1, damage: 1, interval: 1, speed: 1, cash: 1, shieldRegen: 1 };
}

/** The medal board over the stored bests; rebuilt only when the store's board changed underneath it. */
export function riftBoard(ctx: GameContext): MedalBoard {
  const runtime = runtimeOf(ctx);
  const stored = riftStore.read(ctx).board;
  if (runtime.board === null || runtime.boardFor !== stored) {
    runtime.board = createMedalBoard({ ...RIFT_BOARD, state: stored });
    runtime.boardFor = stored;
  }
  return runtime.board;
}

function writeBoard(ctx: GameContext, board: MedalBoard): void {
  const runtime = runtimeOf(ctx);
  const snapshot = board.snapshot();
  runtime.boardFor = snapshot;
  riftStore.write(ctx, { ...riftStore.read(ctx), board: snapshot });
}

/** The mutators a tier carries right now: seeded by tier and re-roll count, so the board can preview them. */
export function riftMutatorsFor(ctx: GameContext, tier: number): readonly string[] {
  const rerolls = riftStore.read(ctx).rerolls[String(tier)] ?? 0;
  return selectRules(RIFT_MUTATORS, { count: mutatorCountFor(tier), seed: `overdrive:${tier}:${rerolls}` }).ids;
}

/** Fold a set of mutators into one effect: multipliers multiply, the rest take the last one named. */
export function combineMutators(ids: readonly string[]): RiftRuntime["effect"] {
  const out = neutralEffect();
  for (const id of ids) {
    const effect = mutatorById(id)?.payload?.effect;
    if (effect === undefined) continue;
    out.health *= effect.health ?? 1;
    out.damage *= effect.damage ?? 1;
    out.interval *= effect.interval ?? 1;
    out.speed *= effect.speed ?? 1;
    out.cash *= effect.cash ?? 1;
    out.shieldRegen *= effect.shieldRegen ?? 1;
    if (effect.surface !== undefined) out.surface = effect.surface;
    if (effect.twinChance !== undefined) out.twinChance = effect.twinChance;
    if (effect.burst !== undefined) out.burst = effect.burst;
    if (effect.regen !== undefined) out.regen = effect.regen;
    if (effect.escort === true) out.escort = true;
  }
  return out;
}

function playerLevel(ctx: GameContext): number {
  return Math.max(1, Math.round(ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1));
}

function playerDistance(ctx: GameContext): number {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return Number.POSITIVE_INFINITY;
  return Math.hypot(player.position[0] - FRONT_SITE.x, player.position[2] - FRONT_SITE.z);
}

function patchRun(ctx: GameContext, patch: Partial<RiftRunView>): void {
  const state = riftStore.read(ctx);
  if (state.run === null) return;
  riftStore.write(ctx, { ...state, run: { ...state.run, ...patch } });
}

/** True while an Overdrive run holds the wreck. */
export function riftActive(ctx: GameContext): boolean {
  const phase = riftStore.read(ctx).run?.phase;
  return phase === "running" || phase === "intermission";
}

/** The shield-recharge multiplier the live run lays on the reclaimer. */
export function riftShieldRegen(ctx: GameContext): number {
  return riftActive(ctx) ? runtimeOf(ctx).effect.shieldRegen : 1;
}

/** What a rift fighter's kill is worth: its level for XP and loot, and the run's luck. */
export function riftLootFor(
  ctx: GameContext,
  id: string,
): { level: number; lootLevel: number; luck: number; boss: boolean; legendary: boolean } | null {
  const runtime = runtimeOf(ctx);
  const unit = runtime.units.get(id);
  if (unit === undefined || runtime.scaling === null) return null;
  const legendary = unit.boss && runtime.scaling.tier >= RIFT_LEGENDARY_TIER;
  return { level: unit.level, lootLevel: runtime.scaling.lootLevel, luck: runtime.scaling.luck, boss: unit.boss, legendary };
}

function onSpawn(ctx: GameContext, id: string, catalogId: string, position: EntityPosition): void {
  const runtime = runtimeOf(ctx);
  const scaling = runtime.scaling;
  if (scaling === null) return;
  const def = enemyById(catalogId);
  const boss = def?.family === "boss";
  const effect = runtime.effect;
  const health = ctx.scene.entity.stats.get(id, "health");
  let maxHealth = health?.max ?? 0;
  if (health !== null) {
    maxHealth = Math.max(1, Math.round(health.max * scaling.health * effect.health));
    ctx.scene.entity.stats.set(id, "health", { max: maxHealth });
    ctx.scene.entity.stats.delta(id, "health", maxHealth);
  }
  setEnemyPower(ctx, id, {
    level: scaling.enemyLevel,
    damage: (scaling.damage / levelDamageMult(scaling.enemyLevel)) * effect.damage,
    interval: effect.interval,
    speed: effect.speed,
  });
  if (effect.surface !== undefined) overrideSurface(ctx, id, effect.surface);
  runtime.units.set(id, { level: scaling.enemyLevel, boss, maxHealth, regenCarry: 0 });

  if (!boss && !runtime.twinning && effect.twinChance !== undefined && runtime.rng() < effect.twinChance) {
    runtime.twinning = true;
    spawnFrontUnit(ctx, catalogId, { x: position[0], z: position[2] }, "twin");
    runtime.twinning = false;
  }
}

function onWave(ctx: GameContext, wave: number): void {
  const runtime = runtimeOf(ctx);
  runtime.release = false;
  patchRun(ctx, { phase: "running", wave, countdown: null });
  if (runtime.effect.escort === true) {
    spawnFrontUnit(ctx, "elite_husk", { x: FRONT_SITE.x + 14, z: FRONT_SITE.z - 6 }, "escort");
  }
}

function gate(ctx: GameContext, dt: number, nextWave: number): boolean {
  const runtime = runtimeOf(ctx);
  const clock = runtime.clock;
  const view = clock.view();
  if (!view.armed || view.nextWave !== nextWave) {
    clock.arm(nextWave);
    runtime.release = false;
  }
  const ran = clock.tick(dt);
  const released = ran || runtime.release;
  if (released) {
    clock.disarm();
    runtime.release = false;
    return true;
  }
  const after = clock.view();
  patchRun(ctx, { phase: "intermission", countdown: after.remaining, countdownTotal: after.total });
  return false;
}

function clearRunUnits(ctx: GameContext): void {
  const runtime = runtimeOf(ctx);
  for (const id of runtime.units.keys()) {
    overrideSurface(ctx, id, null);
    clearEnemyPower(ctx, id);
  }
  runtime.units.clear();
}

function finish(ctx: GameContext, outcome: "won" | "lost", reason: string): void {
  const runtime = runtimeOf(ctx);
  const state = riftStore.read(ctx);
  const run = state.run;
  const scaling = runtime.scaling;
  if (run === null || scaling === null) return;
  runtime.clock.disarm();
  if (outcome === "lost") {
    abortFrontRun(ctx);
    clearRunUnits(ctx);
    runtime.scaling = null;
    riftStore.write(ctx, { ...state, run: { ...run, phase: "lost", countdown: null, reason } });
    ctx.game.notices.push({ text: `OVERDRIVE ${romanTier(run.tier)} LOST — ${reason}`, tone: "deny", ttlMs: 5000 });
    ctx.game.audio.play("shield_break");
    return;
  }
  const board = riftBoard(ctx);
  const submission = board.submit(riftEventId(run.tier), Math.round(run.elapsed * 10) / 10);
  writeBoard(ctx, board);
  const cash = Math.round(scaling.cash * runtime.effect.cash);
  const medalCores = submission.newlyEarned.reduce((sum, medal) => sum + (MEDAL_REWARDS[medal]?.cores ?? 0), 0);
  const cores = scaling.cores + medalCores;
  earn(ctx, "cash", cash, "rift-reward", riftEventId(run.tier));
  earn(ctx, "cores", cores, "rift-reward", riftEventId(run.tier));
  grantXp(ctx, ctx.player.userId, levelXpFor(XP_PER_CLEAR, scaling.enemyLevel));
  clearRunUnits(ctx);
  runtime.scaling = null;
  const after = riftStore.read(ctx);
  riftStore.write(ctx, {
    ...after,
    selected: Math.min(RIFT_TIER_COUNT, board.isOpen(riftEventId(run.tier + 1)) ? run.tier + 1 : run.tier),
    run: {
      ...run,
      phase: "won",
      countdown: null,
      medal: board.medalOf(riftEventId(run.tier)),
      newBest: submission.newBest,
      newMedals: submission.newlyEarned,
      cash,
      cores,
    },
  });
  const medal = submission.medal === null ? "" : ` · ${submission.medal.toUpperCase()}`;
  ctx.game.notices.push({ text: `OVERDRIVE ${romanTier(run.tier)} CLEARED${medal}`, tone: "success", ttlMs: 5000 });
  ctx.game.audio.play("levelup");
}

/** Start a tier: the front resets to its first wave with the tier's crews and mutators laid over it. */
export function startRift(ctx: GameContext, tier: number): { ok: true } | { ok: false; reason: string } {
  const state = riftStore.read(ctx);
  if (!state.unlocked && !frontEverCleared(ctx)) return { ok: false, reason: "Clear the Rustflat Front first." };
  if (riftActive(ctx)) return { ok: false, reason: "An Overdrive run is already live." };
  if (tier < 1 || tier > RIFT_TIER_COUNT) return { ok: false, reason: "No such tier." };
  const board = riftBoard(ctx);
  if (!board.isOpen(riftEventId(tier))) return { ok: false, reason: `Overdrive ${romanTier(tier)} is still locked.` };
  const runtime = runtimeOf(ctx);
  const mutators = riftMutatorsFor(ctx, tier);
  const scaling = riftScaling(tier, playerLevel(ctx));
  clearRunUnits(ctx);
  runtime.scaling = scaling;
  runtime.effect = combineMutators(mutators);
  runtime.outside = 0;
  runtime.release = false;
  runtime.clock.disarm();
  riftStore.write(ctx, {
    ...state,
    unlocked: true,
    selected: tier,
    run: {
      tier,
      phase: "running",
      wave: 1,
      elapsed: 0,
      mutators,
      enemyLevel: scaling.enemyLevel,
      countdown: null,
      countdownTotal: RIFT_INTERMISSION_SECONDS,
    },
  });
  startFrontRun(ctx, {
    onSpawn,
    onWave,
    gate,
    onCleared: (inner) => finish(inner, "won", ""),
  });
  ctx.game.notices.push({ text: `OVERDRIVE ${romanTier(tier)} — crews at level ${scaling.enemyLevel}`, tone: "warn", ttlMs: 3500 });
  return { ok: true };
}

/** Let the counted wave out now. The clock is the medal: every second skipped is a second saved. */
export function callRiftWave(ctx: GameContext): boolean {
  if (riftStore.read(ctx).run?.phase !== "intermission") return false;
  runtimeOf(ctx).release = true;
  return true;
}

export function abandonRift(ctx: GameContext): void {
  loseRift(ctx, "the run was abandoned");
}

/** End a live run as lost, naming why: abandoning it, bleeding out in the ring. */
export function loseRift(ctx: GameContext, reason: string): void {
  if (riftActive(ctx)) finish(ctx, "lost", reason);
}

function onUnitDied(ctx: GameContext, id: string, at: EntityPosition | null): void {
  const runtime = runtimeOf(ctx);
  const unit = runtime.units.get(id);
  if (unit === undefined) return;
  const burst = runtime.effect.burst;
  if (burst !== undefined && at !== null && !unit.boss) {
    const damage = Math.round(14 * levelDamageMult(unit.level) * runtime.effect.damage);
    ctx.scene.entity.telegraph({
      from: ctx.player.userId === id ? "" : id,
      shape: { kind: "circle", radius: burst.radius },
      at: [at[0], at[1], at[2]],
      windupMs: 650,
      effect: { effect: "damage", via: { amount: damage }, radius: burst.radius },
    });
  }
}

/** One tick of a live run: its clock, its regenerating crews and the ring the reclaimer must hold. */
export function tickRift(ctx: GameContext, dt: number): void {
  if (!riftStore.read(ctx).unlocked && frontEverCleared(ctx)) {
    riftStore.write(ctx, { ...riftStore.read(ctx), unlocked: true });
    ctx.game.notices.push({ text: "OVERDRIVE UNLOCKED — the wreck's signal can be pushed past red", tone: "success", ttlMs: 5000 });
  }
  const state = riftStore.read(ctx);
  const run = state.run;
  if (run === null || (run.phase !== "running" && run.phase !== "intermission")) return;
  const runtime = runtimeOf(ctx);
  if (runtime.scaling === null) {
    // A reload mid-run: the live crews did not survive it, so the run cannot either.
    riftStore.write(ctx, { ...state, run: { ...run, phase: "lost", countdown: null, reason: "the signal dropped" } });
    return;
  }
  patchRun(ctx, { elapsed: run.elapsed + dt });

  const regen = runtime.effect.regen;
  if (regen !== undefined) {
    for (const [id, unit] of runtime.units) {
      const health = ctx.scene.entity.stats.get(id, "health");
      if (health === null || health.current <= 0 || health.current >= health.max) continue;
      unit.regenCarry += unit.maxHealth * regen * dt;
      const whole = Math.floor(unit.regenCarry);
      if (whole >= 1) {
        unit.regenCarry -= whole;
        ctx.scene.entity.stats.delta(id, "health", Math.min(whole, health.max - health.current));
      }
    }
  }

  if (playerDistance(ctx) > FRONT_LEAVE_RADIUS) {
    runtime.outside += dt;
    if (runtime.outside >= RIFT_LEAVE_GRACE_SECONDS) finish(ctx, "lost", "you left the wreck");
  } else {
    runtime.outside = 0;
  }
}

/** Seconds until a reclaimer outside the ring forfeits, for the HUD's warning. */
export function riftLeaveSeconds(ctx: GameContext): number | null {
  const outside = runtimeOf(ctx).outside;
  return outside > 0 ? Math.max(0, RIFT_LEAVE_GRACE_SECONDS - outside) : null;
}

export function riftUnitsAlive(ctx: GameContext): number {
  return frontUnitIds(ctx).filter((id) => isFrontUnit(ctx, id) && runtimeOf(ctx).units.has(id)).length;
}

export function registerRift(ctx: GameContext): void {
  ctx.game.events.on("entity.died", (event) => {
    const entity = ctx.scene.entity.get(event.instanceId);
    onUnitDied(ctx, event.instanceId, entity?.position ?? null);
  });

  ctx.game.commands.define("rift.open", {
    apply(state: GameContext) {
      if (gamePhase(state) !== "playing" || activeCharacter() === null) return;
      if (riftActive(state)) return;
      const rift = riftStore.read(state);
      if (!rift.unlocked && !frontEverCleared(state)) {
        state.game.notices.push({ text: "The wreck's signal is jammed. Clear the Rustflat Front to overdrive it.", tone: "deny" });
        return;
      }
      if (!rift.unlocked) riftStore.write(state, { ...rift, unlocked: true });
      riftTerminalOpenStore.write(state, true);
    },
  });
  ctx.game.commands.define("rift.close", {
    apply(state: GameContext) {
      riftTerminalOpenStore.write(state, false);
    },
  });
  ctx.game.commands.define<{ tier?: number }>("rift.select", {
    apply(state: GameContext, input) {
      const tier = Math.max(1, Math.min(RIFT_TIER_COUNT, Math.floor(input.tier ?? 1)));
      riftStore.write(state, { ...riftStore.read(state), selected: tier });
    },
  });
  ctx.game.commands.define<{ tier?: number }>("rift.reroll", {
    apply(state: GameContext, input) {
      const rift = riftStore.read(state);
      const tier = input.tier ?? rift.selected;
      if (mutatorCountFor(tier) === 0 || riftActive(state)) return;
      if (!spend(state, "cores", RIFT_REROLL_CORES, "rift-reroll", riftEventId(tier))) {
        state.game.notices.push({ text: `Re-tuning costs ${RIFT_REROLL_CORES} cores.`, tone: "deny" });
        return;
      }
      const key = String(tier);
      riftStore.write(state, { ...rift, rerolls: { ...rift.rerolls, [key]: (rift.rerolls[key] ?? 0) + 1 } });
    },
  });
  ctx.game.commands.define<{ tier?: number }>("rift.start", {
    apply(state: GameContext, input) {
      if (gamePhase(state) !== "playing" || activeCharacter() === null) return;
      const result = startRift(state, input.tier ?? riftStore.read(state).selected);
      if (!result.ok) {
        state.game.notices.push({ text: result.reason, tone: "deny" });
        return;
      }
      riftTerminalOpenStore.write(state, false);
    },
  });
  ctx.game.commands.define("rift.callWave", {
    apply(state: GameContext) {
      if (callRiftWave(state)) state.game.notices.push({ text: "NEXT WAVE CALLED", tone: "warn", ttlMs: 1400 });
    },
  });
  ctx.game.commands.define("rift.abandon", {
    apply(state: GameContext) {
      abandonRift(state);
    },
  });
  ctx.game.commands.define("rift.dismiss", {
    apply(state: GameContext) {
      const rift = riftStore.read(state);
      if (rift.run !== null && !riftActive(state)) riftStore.write(state, { ...rift, run: null });
    },
  });
  if (import.meta.env?.DEV) {
    // Dev-only: open the ladder and start a tier where the reclaimer stands, so a flow can prove a run
    // without fighting the plain front first.
    ctx.game.commands.define<{ tier?: number; mode?: "run" | "terminal" }>("rift.capture", {
      apply(state: GameContext, input) {
        const rift = riftStore.read(state);
        const tier = input.tier ?? 1;
        const best: Record<string, number> = { ...rift.board.best };
        for (let open = 1; open < tier; open += 1) best[riftEventId(open)] ??= 600;
        riftStore.write(state, { ...rift, unlocked: true, board: { best } });
        // The plain front counts as fought, so standing at the wreck does not wake it.
        abortFrontRun(state);
        const x = FRONT_SITE.x - 10;
        const z = FRONT_SITE.z - 10;
        state.scene.entity.update(state.player.userId, { position: [x, state.world.groundHeightAt(x, z), z] });
        if (input.mode === "terminal") {
          riftStore.write(state, { ...riftStore.read(state), selected: tier });
          riftTerminalOpenStore.write(state, true);
        } else startRift(state, tier);
      },
    });
  }
}
