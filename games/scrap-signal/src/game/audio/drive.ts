import { createMusicState, resolveMusicState, type MusicStateConfig } from "@jgengine/core/audio/musicState";
import { advanceStepCadence, createStepCadenceState, type StepCadenceConfig } from "@jgengine/core/audio/stepCadence";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { enemyById } from "../entities/enemies/catalog";
import { airAt, gust } from "../world/air";
import { zoneAt } from "../world/zones";

const WIND_LOOP = "wind";
const THREAT_RADIUS = 42;


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
  nextLifeAtMs: 4000,
  lifeSeq: 0,
  life: 0,
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
export function audioProbe(ctx: GameContext) {
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
    lifeCues: state.life,
    musicChanges: state.musicChanges,
  };
}

function cue(ctx: GameContext, sound: string, at?: EntityPosition): void {
  stateOf(ctx).cues += 1;
  ctx.game.audio.play(sound, at);
}

/**
 * Wind is the one bed Scrap still owns: its gust curve and per-zone playback rate are this world's
 * own weather, and the engine's zone beds take a static gain with no live level hook. The industry
 * bed moved to `audio.zones`, which the shell starts and crossfades by listener position.
 */
export function startAmbience(ctx: GameContext): void {
  const state = stateOf(ctx);
  if (state.started) return;
  state.started = true;
  ctx.game.audio.loop(WIND_LOOP, "amb_wind");
  state.loops = 1;
}


function threatIntensity(ctx: GameContext, playerPosition: EntityPosition): number {
  let intensity = 0;
  for (const entity of ctx.scene.entity.list()) {
    const def = enemyById(entity.name);
    if (def === undefined) continue;
    const distance = Math.hypot(entity.position[0] - playerPosition[0], entity.position[2] - playerPosition[2]);
    if (distance > THREAT_RADIUS) continue;
    if (def.family === "boss") intensity += 6;
    else if (def.elite === true) intensity += 2;
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

/** Life in the yards between fights: which sound, how often (relative), and how far off it plays. */
const LIFE: readonly { sound: string; weight: number; near: number; far: number }[] = [
  { sound: "amb_bird", weight: 5, near: 0, far: 0 },
  { sound: "amb_sprinkler", weight: 3, near: 10, far: 24 },
  { sound: "amb_dog", weight: 2, near: 30, far: 60 },
];
const LIFE_TOTAL = LIFE.reduce((sum, entry) => sum + entry.weight, 0);

/** A deterministic 0..1 from a counter, so the same run hears the same yard. */
function lifeRoll(seq: number, salt: number): number {
  const x = Math.sin(seq * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Every 5-12 seconds outside a fight, the suburb makes a sound: a bird overhead, a sprinkler ticking
 * a yard away, a dog barking a few houses down. The dogs and sprinklers are positional, so they sit
 * somewhere in the world; the birds are everywhere.
 */
function tickSuburbLife(ctx: GameContext, state: ReturnType<typeof stateOf>, nowMs: number, position: EntityPosition): void {
  if (nowMs < state.nextLifeAtMs) return;
  state.lifeSeq += 1;
  const seq = state.lifeSeq;
  state.nextLifeAtMs = nowMs + 5000 + lifeRoll(seq, 1) * 7000;
  if (hostileNear(ctx, position, THREAT_RADIUS)) return;
  let pick = lifeRoll(seq, 2) * LIFE_TOTAL;
  const entry = LIFE.find((candidate) => (pick -= candidate.weight) < 0) ?? LIFE[0]!;
  state.life += 1;
  if (entry.far <= 0) {
    cue(ctx, entry.sound);
    return;
  }
  const angle = lifeRoll(seq, 3) * Math.PI * 2;
  const distance = entry.near + lifeRoll(seq, 4) * (entry.far - entry.near);
  cue(ctx, entry.sound, [position[0] + Math.cos(angle) * distance, position[1], position[2] + Math.sin(angle) * distance]);
}

function hostileNear(ctx: GameContext, at: EntityPosition, radius: number): boolean {
  return ctx.scene.entity.list().some((entity) => enemyById(entity.name) !== undefined && (ctx.scene.entity.stats.get(entity.id, "health")?.current ?? 0) > 0 && Math.hypot(entity.position[0] - at[0], entity.position[2] - at[2]) < radius);
}

export function tickAudio(ctx: GameContext, nowMs: number): void {
  const state = stateOf(ctx);
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return;
  const position = playerEntity.position;

  const zone = zoneAt(position[0], position[2]);
  const air = airAt(zone?.id ?? null);
  ctx.game.audio.setLoop(WIND_LOOP, { gain: air.wind * gust(nowMs), rate: air.rate });
  tickSuburbLife(ctx, state, nowMs, position);

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
    vacuum: "gun_vacuum",
    extinguisher: "gun_extinguisher",
  };
  cue(ctx, byFamily[family] ?? "gun_pistol");
}

export function playHit(ctx: GameContext, at: EntityPosition, crit: boolean): void {
  cue(ctx, crit ? "impact_crit" : "impact_metal", at);
}
