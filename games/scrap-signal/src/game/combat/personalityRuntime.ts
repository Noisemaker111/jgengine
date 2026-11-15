import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import { enemyById } from "../entities/enemies/catalog";
import { equippedGun } from "../feel";
import {
  effectiveMagSize,
  gunById,
  isFreeShot,
  isReloading,
  bossLine,
  junkCard,
  milestoneLine,
  magLoaded,
  moodDamageScale,
  moodIntervalScale,
  moodLabel,
  moodReloadScale,
  personalityOf,
  PERSONALITY_TUNING,
  reservePhase,
  type BarkEvent,
  type GunDef,
  type MoodState,
} from "../handroll";

/**
 * The personalities, live. This file keeps each weapon's moment — how long it has been out, its kill
 * streak, whether it is sulking, whether a jilted Clingy gun is guilt-tripping you — and turns it into
 * the numbers the shot, hit and reload read, plus the speech bubbles. The rules themselves are the
 * model in `handroll/personality.ts`.
 */

export interface GunBark {
  gunId: string;
  /** The weapon's name, as the bubble signs it. */
  name: string;
  personality: string;
  color: string;
  line: string;
  event: BarkEvent;
  atMs: number;
}

/** The last thing a weapon said. The HUD hangs it over the ammo plate as a speech bubble. */
export const gunBarkStore = defineStore<GunBark | null>("junk.gunBark", null);

interface MoodRuntime {
  heldId: string | null;
  heldSinceMs: number;
  everHeld: Set<string>;
  stacks: Map<string, number>;
  sulkUntil: Map<string, number>;
  guilt: { gunId: string; untilMs: number } | null;
  shots: Map<string, number>;
  lowAmmoSaid: Set<string>;
  /** A kill landed since the last tick: the tick decides whether the gun says something. */
  killBark: string | null;
  /** A career milestone reached since the last tick: said over any plain kill line. */
  milestone: { gunId: string; line: string } | null;
  /** A carried weapon that will remark on the newcomer once the newcomer has said hello. */
  rival: { gunId: string; atMs: number } | null;
  /** The held gun was mid-reload at the last tick. */
  wasReloading: boolean;
  lastBarkMs: number;
  rng: () => number;
}

const moodsOf = perContext(
  (): MoodRuntime => ({
    heldId: null,
    heldSinceMs: 0,
    everHeld: new Set(),
    stacks: new Map(),
    sulkUntil: new Map(),
    guilt: null,
    shots: new Map(),
    lowAmmoSaid: new Set(),
    killBark: null,
    milestone: null,
    rival: null,
    wasReloading: false,
    lastBarkMs: Number.NEGATIVE_INFINITY,
    rng: seededRng("junk-barks"),
  }),
);

const nowMs = (ctx: GameContext) => ctx.time.now() * 1000;

/** Quiet time between barks, so a weapon talks like a character rather than a ticker. */
const BARK_GAP_MS: Record<BarkEvent, number> = {
  pickup: 0,
  merge: 0,
  jam: 800,
  rival: 1500,
  switchAway: 600,
  reload: 3500,
  lowAmmo: 2500,
  kill: 4500,
};
/** Kills only sometimes get a line: every kill would drown the fight. */
const KILL_BARK_CHANCE = 0.45;

/**
 * Have `gun` say something for `event`, if it is not still talking. Returns the line, or null. An
 * `exact` line (a milestone, an heirloom's story) is said in place of a picked one, and always.
 */
export function bark(ctx: GameContext, gun: GunDef, event: BarkEvent, exact?: string): string | null {
  const runtime = moodsOf(ctx);
  const now = nowMs(ctx);
  if (exact === undefined && now - runtime.lastBarkMs < BARK_GAP_MS[event]) return null;
  if (exact === undefined && event === "kill" && runtime.rng() >= KILL_BARK_CHANCE) return null;
  const personality = personalityOf(gun);
  const lines = personality.barks[event];
  if (exact === undefined && lines.length === 0) return null;
  const line = exact ?? lines[Math.min(lines.length - 1, Math.floor(runtime.rng() * lines.length))]!;
  runtime.lastBarkMs = now;
  gunBarkStore.write(ctx, { gunId: gun.id, name: gun.name, personality: personality.name, color: personality.color, line, event, atMs: now });
  return line;
}

function mood(ctx: GameContext, gun: GunDef): MoodState {
  const runtime = moodsOf(ctx);
  const now = nowMs(ctx);
  const held = runtime.heldId === gun.id;
  const guilt = runtime.guilt;
  return {
    heldMs: held ? now - runtime.heldSinceMs : 0,
    killStacks: runtime.stacks.get(gun.id) ?? 0,
    magFraction: magLoaded(ctx, gun) / Math.max(1, effectiveMagSize(gun)),
    guilty: guilt !== null && guilt.gunId !== gun.id && now < guilt.untilMs,
  };
}

/** The damage multiplier the gun's personality puts on its hits right now. */
export function moodDamageFor(ctx: GameContext, gun: GunDef): number {
  return moodDamageScale(personalityOf(gun).id, mood(ctx, gun));
}

/** Reload-speed multiplier from the personality (Grumpy and Dramatic take their time). */
export function moodReloadFor(gun: GunDef): number {
  return moodReloadScale(personalityOf(gun).id);
}

/** Fire-interval multiplier from the personality (Philosophical ponders between shots). */
export function moodIntervalFor(gun: GunDef): number {
  return moodIntervalScale(personalityOf(gun).id);
}

/** The HUD's one-line mood readout for the held gun. */
export function moodReadout(ctx: GameContext, gun: GunDef): string {
  const runtime = moodsOf(ctx);
  const sulking = nowMs(ctx) < (runtime.sulkUntil.get(gun.id) ?? 0);
  const label = moodLabel(personalityOf(gun).id, mood(ctx, gun), sulking);
  const guilt = runtime.guilt;
  if (label === "" && guilt !== null && guilt.gunId !== gun.id && nowMs(ctx) < guilt.untilMs) return "GUILT-TRIPPED -10%";
  return label;
}

export interface MoodShot {
  /** A sulking Competitive gun refuses the trigger. */
  jammed: boolean;
  /** A Philosophical gun's free round. */
  free: boolean;
  /** A Paranoid gun's twitch: one more round spent. */
  extraRound: boolean;
}

/** One trigger pull, read before the round is spent. */
export function moodShot(ctx: GameContext, gun: GunDef): MoodShot {
  const runtime = moodsOf(ctx);
  const id = personalityOf(gun).id;
  if (nowMs(ctx) < (runtime.sulkUntil.get(gun.id) ?? 0)) {
    bark(ctx, gun, "jam");
    return { jammed: true, free: false, extraRound: false };
  }
  const shots = (runtime.shots.get(gun.id) ?? 0) + 1;
  runtime.shots.set(gun.id, shots);
  return {
    jammed: false,
    free: isFreeShot(id, shots),
    extraRound: id === "paranoid" && runtime.rng() < PERSONALITY_TUNING.paranoid.nervousChance,
  };
}

/** A kill credited to a gun: streaks, a cheerful heal, maybe a line. */
export function moodKill(ctx: GameContext, gun: GunDef, from: string): void {
  const runtime = moodsOf(ctx);
  const id = personalityOf(gun).id;
  if (id === "competitive") {
    runtime.stacks.set(gun.id, Math.min(PERSONALITY_TUNING.competitive.maxStacks, (runtime.stacks.get(gun.id) ?? 0) + 1));
  } else if (id === "cheerful" && reservePhase(ctx) !== "downed") {
    const health = ctx.scene.entity.stats.get(from, "health");
    if (health !== null && health.current < health.max) {
      const amount = Math.max(1, Math.round(health.max * PERSONALITY_TUNING.cheerful.killHeal));
      ctx.scene.entity.effect({ from, to: from, effect: "damage", via: { amount: -amount } });
    }
  }
  gun.kills = (gun.kills ?? 0) + 1;
  const milestone = milestoneLine(id, gun.kills);
  if (milestone !== null && runtime.milestone === null) runtime.milestone = { gunId: gun.id, line: milestone };
  else runtime.killBark = gun.id;
}

/** A boss fell to the player: the weapon in hand has something to say about it, over any other line. */
export function moodBoss(ctx: GameContext, catalogId: string): void {
  const boss = enemyById(catalogId);
  const held = equippedGun();
  const gun = held === null ? undefined : gunById(held);
  if (boss?.family !== "boss" || gun === undefined) return;
  moodsOf(ctx).milestone = { gunId: gun.id, line: bossLine(personalityOf(gun).id, boss.name) };
}

/** A weapon says hello when it is picked up; an heirloom tells its story instead. */
export function moodPickup(ctx: GameContext, gun: GunDef): void {
  const story = junkCard(gun).story;
  bark(ctx, gun, "pickup", story === null ? undefined : `\u201c${story}\u201d`);
  // One of the weapons already carried has an opinion about the newcomer: a jealous one first.
  const carried = ctx.player.inventory.state("hotbar").slots.flatMap((slot) => {
    const other = slot === null ? undefined : gunById(slot.itemId);
    return other === undefined || other.id === gun.id ? [] : [other];
  });
  const jealous = carried.find((other) => ["clingy", "competitive"].includes(personalityOf(other).id)) ?? carried[0];
  if (jealous !== undefined) moodsOf(ctx).rival = { gunId: jealous.id, atMs: nowMs(ctx) + 2200 };
}

/**
 * Paranoid tracking: when a hostile sits within a few degrees of where the shot is going, the shot
 * turns onto it. Returns the aim unchanged for every other personality, or with nothing in the cone.
 */
export function paranoidAim<T extends object>(ctx: GameContext, gun: GunDef, from: string, aim: T): T | { yaw: number; pitch: number } {
  if (personalityOf(gun).id !== "paranoid" || !("yaw" in aim) || !("pitch" in aim)) return aim;
  const look = aim as unknown as { yaw: number; pitch: number };
  return trackNearest(ctx, gun, from, look);
}

function trackNearest(ctx: GameContext, gun: GunDef, from: string, aim: { yaw: number; pitch: number }): { yaw: number; pitch: number } {
  const me = ctx.scene.entity.get(from);
  if (me === null) return aim;
  const tuning = PERSONALITY_TUNING.paranoid;
  const cone = (tuning.assistDeg * Math.PI) / 180;
  const eye = me.position[1] + 1.6;
  let best: { yaw: number; pitch: number; off: number } | null = null;
  for (const entity of ctx.scene.entity.list()) {
    if (enemyById(entity.name) === undefined) continue;
    if ((ctx.scene.entity.stats.get(entity.id, "health")?.current ?? 0) <= 0) continue;
    const dx = entity.position[0] - me.position[0];
    const dz = entity.position[2] - me.position[2];
    const flat = Math.hypot(dx, dz);
    if (flat < 0.5 || flat > Math.min(tuning.assistRange, gun.weapon.range)) continue;
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(entity.position[1] + 0.9 - eye, flat);
    const dyaw = Math.atan2(Math.sin(yaw - aim.yaw), Math.cos(yaw - aim.yaw));
    const off = Math.hypot(dyaw, pitch - aim.pitch);
    if (off <= cone && (best === null || off < best.off)) best = { yaw, pitch, off };
  }
  return best === null ? aim : { yaw: best.yaw, pitch: best.pitch };
}

/**
 * Once a tick: notice the held weapon changing (switch-away lines, a Competitive sulk, a Clingy guilt
 * trip, a fresh hold clock) and a magazine running low.
 */
export function tickPersonality(ctx: GameContext): void {
  const runtime = moodsOf(ctx);
  const now = nowMs(ctx);
  const heldId = equippedGun();
  if (heldId !== runtime.heldId) {
    const previous = runtime.heldId === null ? undefined : gunById(runtime.heldId);
    if (previous !== undefined) {
      const left = personalityOf(previous).id;
      bark(ctx, previous, "switchAway");
      if (left === "competitive") runtime.stacks.delete(previous.id);
      if (left === "clingy") runtime.guilt = { gunId: previous.id, untilMs: now + PERSONALITY_TUNING.clingy.guiltMs };
    }
    runtime.heldId = heldId;
    runtime.heldSinceMs = now;
    const next = heldId === null ? undefined : gunById(heldId);
    if (next !== undefined) {
      if (personalityOf(next).id === "competitive" && runtime.everHeld.has(next.id) && previous !== undefined) {
        runtime.sulkUntil.set(next.id, now + PERSONALITY_TUNING.competitive.sulkMs);
      }
      runtime.everHeld.add(next.id);
    }
  }
  const killer = runtime.killBark === null ? undefined : gunById(runtime.killBark);
  runtime.killBark = null;
  const proud = runtime.milestone === null ? undefined : gunById(runtime.milestone.gunId);
  if (proud !== undefined && runtime.milestone !== null) bark(ctx, proud, "kill", runtime.milestone.line);
  else if (killer !== undefined) bark(ctx, killer, "kill");
  runtime.milestone = null;
  const rival = runtime.rival === null || now < runtime.rival.atMs ? undefined : gunById(runtime.rival.gunId);
  if (rival !== undefined) {
    runtime.rival = null;
    bark(ctx, rival, "rival");
  }
  const held = heldId === null ? undefined : gunById(heldId);
  if (held === undefined) return;
  const reloading = isReloading(ctx, held);
  if (reloading && !runtime.wasReloading) bark(ctx, held, "reload");
  runtime.wasReloading = reloading;
  const fraction = magLoaded(ctx, held) / Math.max(1, effectiveMagSize(held));
  if (fraction > 0.5) runtime.lowAmmoSaid.delete(held.id);
  else if (fraction > 0 && fraction <= 0.25 && !runtime.lowAmmoSaid.has(held.id)) {
    if (bark(ctx, held, "lowAmmo") !== null) runtime.lowAmmoSaid.add(held.id);
  }
}
