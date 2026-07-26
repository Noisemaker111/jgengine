import { createMusicState, resolveMusicState, type MusicStateConfig } from "@jgengine/core/audio/musicState";
import { advanceStepCadence, createStepCadenceState, type StepCadenceConfig } from "@jgengine/core/audio/stepCadence";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { enemyById } from "../entities/enemies/catalog";
import { zoneAt } from "../world/zones";

const WIND_LOOP = "wind";
const INDUSTRY_LOOP = "industry";
const THREAT_RADIUS = 42;

/**
 * Per-zone air. The flats are meant to sound like different places before they look like them:
 * Windshear is a gale, the Blight is a low reactor throb with the wind pushed down under it.
 */
const ZONE_AIR: Record<string, { wind: number; rate: number; industry: number }> = {
  windshear_waste: { wind: 1, rate: 1.18, industry: 0.15 },
  southern_shelf: { wind: 0.72, rate: 1.02, industry: 0.2 },
  arid_badlands: { wind: 0.5, rate: 0.92, industry: 0.55 },
  three_horns: { wind: 0.66, rate: 0.96, industry: 0.3 },
  the_dust: { wind: 0.85, rate: 1.06, industry: 0.35 },
  eridium_blight: { wind: 0.45, rate: 0.74, industry: 1 },
};
const DEFAULT_AIR = { wind: 0.6, rate: 1, industry: 0.3 };

const MUSIC: MusicStateConfig = {
  release: 0.6,
  tiers: [
    { id: "ambient", theme: "wastes", enter: 0 },
    { id: "skirmish", theme: "skirmish", enter: 1, holdMs: 6000 },
    { id: "reactor", theme: "reactor", enter: 6, holdMs: 9000 },
  ],
};

const STEPS: StepCadenceConfig = { strideDistance: 1.9 };

const stateOf = perContext(() => ({
  started: false,
  cadence: createStepCadenceState(),
  music: createMusicState(),
  lastPosition: null as EntityPosition | null,
  nextBarkAtMs: 0,
  lastHealth: null as number | null,
  lastShield: null as number | null,
  cues: 0,
  loops: 0,
  steps: 0,
  travelled: 0,
  barks: 0,
  musicChanges: 0,
}));

/**
 * Capture probe counters. Sound is the one change a screenshot cannot carry, so the drive proves it
 * by reading these back over the agent bridge: non-zero means the real browser runtime fired cues.
 */
export function audioProbe(ctx: GameContext): Record<string, number> {
  const state = stateOf(ctx);
  const position = ctx.scene.entity.get(ctx.player.userId)?.position ?? [0, 0, 0];
  return {
    // Position rides along so a zero footstep count can be told apart from a player who never moved.
    x: Math.round(position[0] * 100) / 100,
    z: Math.round(position[2] * 100) / 100,
    travelled: Math.round(state.travelled * 100) / 100,
    audioCues: state.cues,
    audioLoops: state.loops,
    footsteps: state.steps,
    barks: state.barks,
    musicChanges: state.musicChanges,
  };
}

function cue(ctx: GameContext, sound: string, at?: EntityPosition): void {
  stateOf(ctx).cues += 1;
  ctx.game.audio.play(sound, at);
}

export function startAmbience(ctx: GameContext): void {
  const state = stateOf(ctx);
  if (state.started) return;
  state.started = true;
  ctx.game.audio.loop(WIND_LOOP, "amb_wind");
  ctx.game.audio.loop(INDUSTRY_LOOP, "amb_industry");
  state.loops = 2;
}

/** Slow, deterministic gust curve — two incommensurate periods so it never audibly repeats. */
function gust(nowMs: number): number {
  const t = nowMs / 1000;
  return 0.72 + 0.2 * Math.sin(t / 7.3) + 0.08 * Math.sin(t / 2.9);
}

function threatIntensity(ctx: GameContext, playerPosition: EntityPosition): number {
  let intensity = 0;
  for (const entity of ctx.scene.entity.list()) {
    const def = enemyById(entity.name);
    if (def === undefined) continue;
    const distance = Math.hypot(entity.position[0] - playerPosition[0], entity.position[2] - playerPosition[2]);
    if (distance > THREAT_RADIUS) continue;
    if (def.family === "boss") intensity += 6;
    else if (def.badass === true) intensity += 2;
    else intensity += 1;
  }
  return intensity;
}

/**
 * One enemy in the pack chirps every few seconds while the player is in earshot, so a camp is
 * audible as occupied before it is visible. Positional, and rate-limited across the whole pack.
 */
function tickBarks(ctx: GameContext, playerPosition: EntityPosition, nowMs: number): void {
  const state = stateOf(ctx);
  if (nowMs < state.nextBarkAtMs) return;
  const candidates = ctx.scene.entity
    .list()
    .filter(
      (entity) =>
        enemyById(entity.name) !== undefined &&
        Math.hypot(entity.position[0] - playerPosition[0], entity.position[2] - playerPosition[2]) < 34,
    );
  state.nextBarkAtMs = nowMs + 2600 + ctx.rng() * 4200;
  if (candidates.length === 0) return;
  const speaker = candidates[Math.floor(ctx.rng() * candidates.length)];
  if (speaker === undefined) return;
  state.barks += 1;
  cue(ctx, "bark_idle", speaker.position);
}

export function tickAudio(ctx: GameContext, nowMs: number): void {
  const state = stateOf(ctx);
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return;
  const position = playerEntity.position;

  const zone = zoneAt(position[0], position[2]);
  const air = (zone === null ? undefined : ZONE_AIR[zone.id]) ?? DEFAULT_AIR;
  ctx.game.audio.setLoop(WIND_LOOP, { gain: air.wind * gust(nowMs), rate: air.rate });
  ctx.game.audio.setLoop(INDUSTRY_LOOP, { gain: air.industry });

  if (state.lastPosition !== null) {
    const travelled = Math.hypot(position[0] - state.lastPosition[0], position[2] - state.lastPosition[2]);
    state.travelled += travelled;
    const step = advanceStepCadence(state.cadence, { distance: travelled, moving: travelled > 0.001 }, STEPS);
    state.cadence = step.state;
    if (step.steps > 0) {
      state.steps += step.steps;
      cue(ctx, step.foot === 0 ? "foot_a" : "foot_b");
    }
  }
  state.lastPosition = [position[0], position[1], position[2]];

  const music = resolveMusicState(state.music, { intensity: threatIntensity(ctx, position), nowMs }, MUSIC);
  state.music = music.state;
  if (music.changed) {
    state.musicChanges += 1;
    ctx.game.audio.music(music.theme);
  }

  tickBarks(ctx, position, nowMs);
  tickPlayerDamage(ctx);
}

/**
 * Damage feedback reads off the stats rather than a damage event, so it covers every source —
 * bullets, boss auras, burn ticks — without each one remembering to make a noise.
 */
function tickPlayerDamage(ctx: GameContext): void {
  const state = stateOf(ctx);
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? null;
  const shield = ctx.scene.entity.stats.get(ctx.player.userId, "shield")?.current ?? null;
  if (state.lastHealth !== null && health !== null && health < state.lastHealth) {
    cue(ctx, "hurt_player");
  }
  if (state.lastShield !== null && shield !== null && shield <= 0 && state.lastShield > 0) {
    cue(ctx, "shield_break");
  }
  state.lastHealth = health;
  state.lastShield = shield;
}

export function playShot(ctx: GameContext, family: string): void {
  const byFamily: Record<string, string> = {
    pistol: "gun_pistol",
    smg: "gun_smg",
    shotgun: "gun_shotgun",
    sniper: "gun_sniper",
    launcher: "gun_launcher",
  };
  cue(ctx, byFamily[family] ?? "gun_pistol");
}

export function playHit(ctx: GameContext, at: EntityPosition, crit: boolean): void {
  cue(ctx, crit ? "impact_crit" : "impact_metal", at);
}
