import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { seededRng } from "@jgengine/core/random/rng";
import {
  createTriggeredRuleEngine,
  type RuleFiring,
  type TriggeredRule,
  type TriggeredRuleEngine,
} from "@jgengine/core/rules/triggeredRules";
import { registerRuleEffect } from "@jgengine/core/rules/ruleEffects";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { enemyById } from "../entities/enemies/catalog";
import {
  BOSS_DROP_CHANCE,
  applyDot,
  bossDropFor,
  gunById,
  gunPerks,
  magLoaded,
  effectiveMagSize,
  refundRounds,
  reservePhase,
  rollGun,
  setMagazineHooks,
  type GunDef,
  type PerkDef,
} from "../handroll";
import { session } from "../session";
import { lastPickupStore } from "../stores";
import { zoneLevelAt } from "../world/sites";
import { isFluxed, type GunHitMods, type HitOutcome } from "./hitModel";

/**
 * Gun perks on the engine's triggered-rules seam. The engine owns matching, predicates, stacking,
 * durations, cooldowns and rate limits; this file only stamps a gun's perk templates as rules the first
 * time the gun fires, raises the five gun events, and applies the effect ids the rules name. Timed
 * buffs (Rampage, Kill Clip, Outlaw) are the engine's live instances, read back on the next hit.
 */

const EFFECTS = [
  ["perk.damage", "Timed damage buff (pct per stack)"],
  ["perk.reload", "Timed reload-speed buff"],
  ["perk.arm", "Kill Clip primer"],
  ["perk.refund", "Rounds back in the magazine"],
  ["perk.explode", "Burst at the kill"],
  ["perk.heal", "Heal a share of max health"],
  ["perk.shield", "Restore a share of shield"],
  ["perk.spread", "Copy the gun's DoT to nearby enemies"],
  ["perk.count", "Every-Nth counter"],
  ["perk.crit", "Guaranteed crit for this shot or hit"],
  ["perk.shotScale", "Damage scale for this shot"],
  ["perk.hitScale", "Damage scale for this hit"],
] as const;
for (const [id, label] of EFFECTS) registerRuleEffect({ id, label });

interface PerkRuntime {
  rules: TriggeredRuleEngine;
  stamped: Set<string>;
  /** The gun whose AoE (launcher round, explosive splash) is landing right now, for kill credit. */
  splashGun: { gun: GunDef; from: string } | null;
  /** The aim of the last trigger pull (dev only), so the capture can stand its husks in the line of fire. */
  lastAim: unknown;
  /** True while a perk's own effect lands, so a perk burst never chains into another perk. */
  applyingPerk: boolean;
  /** Bodies that died while one pellet was landing; the world may drop a dead body's stats at once. */
  deathsThisHit: Set<string> | null;
  /** Boss legendary rolls ride their own stream, so the normal drop stream never moves. */
  bossRng: () => number;
}

const perksOf = perContext(
  (): PerkRuntime => ({
    rules: createTriggeredRuleEngine(),
    stamped: new Set(),
    splashGun: null,
    lastAim: null,
    applyingPerk: false,
    deathsThisHit: null,
    bossRng: seededRng("scrap-boss-drops"),
  }),
);

function nowMs(ctx: GameContext): number {
  return ctx.time.now() * 1000;
}

function ruleId(gunId: string, perkId: string, index: number): string {
  return `${gunId}|${perkId}|${index}`;
}

function perkOfRule(id: string): string {
  return id.split("|")[1] ?? "";
}

function stamp(runtime: PerkRuntime, gun: GunDef): readonly PerkDef[] {
  const perks = gunPerks(gun);
  if (runtime.stamped.has(gun.id)) return perks;
  runtime.stamped.add(gun.id);
  for (const perk of perks) {
    perk.rules.forEach((template, index) => {
      // Rules match on event type, so each gun's copy gates on its own id: one gun's shots never
      // fill another gun's counter.
      const own = { eq: ["gun", gun.id] } as const;
      const when = template.when === undefined ? own : { all: [own, template.when] };
      runtime.rules.add({ ...template, when, id: ruleId(gun.id, perk.id, index), owner: gun.id } as TriggeredRule);
    });
  }
  return perks;
}

function dispatch(ctx: GameContext, gun: GunDef, type: string, facts: Record<string, unknown>): readonly RuleFiring[] {
  const runtime = perksOf(ctx);
  if (stamp(runtime, gun).length === 0) return [];
  const now = nowMs(ctx);
  runtime.rules.tick(now);
  return runtime.rules.dispatch({ type, subject: gun.id, facts: { ...facts, gun: gun.id } }, now).filter((firing) => firing.blocked === undefined);
}

function num(firing: RuleFiring, key: string, fallback = 0): number {
  const value = firing.effect.params?.[key];
  return typeof value === "number" ? value : fallback;
}

function labelOf(firing: RuleFiring): string {
  const label = firing.effect.params?.label;
  if (typeof label === "string") return label;
  const perk = gunPerks(gunById(firing.target) ?? ({} as GunDef)).find((entry) => entry.id === perkOfRule(firing.ruleId));
  return (perk?.name ?? "PERK").toUpperCase();
}

function callout(ctx: GameContext, text: string, at?: string | readonly [number, number, number]): void {
  if (typeof at === "string" || at === undefined) {
    ctx.scene.entity.floatText({ instanceId: at ?? ctx.player.userId, text, kind: "pickup" });
  } else {
    ctx.scene.entity.floatText({ position: [at[0], at[1] + 1.6, at[2]], text, kind: "pickup" });
  }
}

/** Reset a counter rule so its stacks start again from zero. */
function resetCounter(ctx: GameContext, firing: RuleFiring): void {
  const rules = perksOf(ctx).rules;
  const rule = rules.rules().find((entry) => entry.id === firing.ruleId);
  if (rule === undefined) return;
  rules.remove(rule.id);
  rules.add(rule);
}

/** What an in-flight shot or hit firing asks of the hit; counters that fill also land their refunds. */
function shapeFrom(ctx: GameContext, gun: GunDef, firings: readonly RuleFiring[], mods: GunHitMods): GunHitMods {
  let damageScale = mods.damageScale ?? 1;
  let forceCrit = mods.forceCrit === true;
  for (const firing of firings) {
    const id = firing.effect.id;
    if (id === "perk.crit") forceCrit = true;
    else if (id === "perk.shotScale" || id === "perk.hitScale") damageScale *= 1 + num(firing, "pct");
    else if (id === "perk.count" && (firing.stacks ?? 0) >= num(firing, "every", 1)) {
      resetCounter(ctx, firing);
      if (firing.effect.params?.then === "crit") {
        forceCrit = true;
        callout(ctx, labelOf(firing));
      } else {
        const added = refundRounds(ctx, gun, num(firing, "rounds", 1));
        if (added > 0) callout(ctx, `${labelOf(firing)} +${added}`);
      }
    }
  }
  return { damageScale, forceCrit };
}

/** The live timed damage buff on a gun: Rampage stacks, Kill Clip, Skullsplit. 1 with none. */
export function perkDamageScale(ctx: GameContext, gun: GunDef): number {
  const runtime = perksOf(ctx);
  if (!runtime.stamped.has(gun.id)) return 1;
  runtime.rules.tick(nowMs(ctx));
  let pct = 0;
  for (const effect of runtime.rules.activeFor(gun.id)) {
    if (effect.effectId !== "perk.damage") continue;
    const per = typeof effect.params?.pct === "number" ? effect.params.pct : 0;
    pct += per * effect.stacks;
  }
  return 1 + pct;
}

/** The live reload-speed multiplier (Outlaw). 1 with none. */
export function perkReloadScale(ctx: GameContext, gun: GunDef): number {
  const runtime = perksOf(ctx);
  if (!runtime.stamped.has(gun.id)) return 1;
  runtime.rules.tick(nowMs(ctx));
  let pct = 0;
  for (const effect of runtime.rules.activeFor(gun.id)) {
    if (effect.effectId === "perk.reload" && typeof effect.params?.pct === "number") pct = Math.max(pct, effect.params.pct);
  }
  return 1 + pct;
}

/** Live buff readout for the HUD: label and stacks of each timed perk on a gun. */
export function activePerkBuffs(ctx: GameContext, gun: GunDef): { label: string; stacks: number; leftMs: number }[] {
  const runtime = perksOf(ctx);
  if (!runtime.stamped.has(gun.id)) return [];
  const now = nowMs(ctx);
  return runtime.rules
    .activeFor(gun.id)
    .filter((effect) => (effect.effectId === "perk.damage" || effect.effectId === "perk.reload") && effect.expiresAt > now)
    .map((effect) => ({
      label: typeof effect.params?.label === "string" ? effect.params.label : (gunPerks(gun).find((perk) => perk.id === perkOfRule(effect.ruleId))?.name ?? "PERK").toUpperCase(),
      stacks: effect.stacks,
      leftMs: effect.expiresAt - now,
    }));
}

/**
 * One trigger pull. Call before the round is spent (`fullMag` reads the magazine). Returns the shaping
 * every pellet of this shot carries: an Overcharge/Sixgun crit, Longshot's opening scale.
 */
export function perkShot(ctx: GameContext, gun: GunDef, aim?: unknown): GunHitMods {
  if (import.meta.env.DEV && aim !== undefined) perksOf(ctx).lastAim = aim;
  const fullMag = magLoaded(ctx, gun) >= effectiveMagSize(gun);
  return shapeFrom(ctx, gun, dispatch(ctx, gun, "gun.shot", { fullMag }), {});
}

/** The mods for one pellet: the shot's shaping, live damage buffs, and pre-hit perks (Fluxer, Last Word). */
export function perkHitMods(ctx: GameContext, gun: GunDef, targetId: string, shot: GunHitMods): GunHitMods {
  const firings = dispatch(ctx, gun, "gun.prehit", { fluxed: isFluxed(ctx, targetId), downed: reservePhase(ctx) === "downed" });
  const shaped = shapeFrom(ctx, gun, firings, shot);
  return { ...shaped, damageScale: (shaped.damageScale ?? 1) * perkDamageScale(ctx, gun) };
}

/** After a pellet resolved: crit counters, then the kill perks when this pellet dropped the body. */
export function perkAfterHit(ctx: GameContext, gun: GunDef, from: string, targetId: string, outcome: HitOutcome, killed: boolean): void {
  shapeFrom(ctx, gun, dispatch(ctx, gun, "gun.hit", { crit: outcome.crit }), {});
  if (killed) perkKill(ctx, gun, from, targetId, outcome.crit);
}

/** A reload started on a gun: Kill Clip's window check. */
function perkReload(ctx: GameContext, gun: GunDef): void {
  const runtime = perksOf(ctx);
  if (!runtime.stamped.has(gun.id)) return;
  runtime.rules.tick(nowMs(ctx));
  const armed = runtime.rules.activeFor(gun.id).some((effect) => effect.effectId === "perk.arm");
  for (const firing of dispatch(ctx, gun, "gun.reload", { armed })) {
    if (firing.effect.id === "perk.damage") callout(ctx, labelOf(firing));
  }
}

function livingEnemiesNear(ctx: GameContext, at: readonly [number, number, number], radius: number, except: string): string[] {
  return ctx.scene.entity
    .list()
    .filter((entity) => entity.id !== except && enemyById(entity.name) !== undefined)
    .filter((entity) => (ctx.scene.entity.stats.get(entity.id, "health")?.current ?? 0) > 0)
    .map((entity) => ({ id: entity.id, d: Math.hypot(entity.position[0] - at[0], entity.position[2] - at[2]) }))
    .filter((entry) => entry.d <= radius)
    .sort((a, b) => a.d - b.d)
    .map((entry) => entry.id);
}

/** A kill credited to a gun: raise `gun.kill` and land every effect the rules fire. */
export function perkKill(ctx: GameContext, gun: GunDef, from: string, victimId: string, crit: boolean): void {
  const runtime = perksOf(ctx);
  if (runtime.applyingPerk) return;
  const elemental = gun.element !== "none" && gun.element !== "explosive" && gun.element !== "flux";
  const firings = dispatch(ctx, gun, "gun.kill", { crit, elemental });
  if (firings.length === 0) return;
  const at = ctx.scene.entity.get(victimId)?.position ?? ctx.scene.entity.get(from)?.position ?? [0, 0, 0];
  runtime.applyingPerk = true;
  try {
    for (const firing of firings) applyKillEffect(ctx, gun, from, victimId, at, firing);
  } finally {
    runtime.applyingPerk = false;
  }
}

function applyKillEffect(
  ctx: GameContext,
  gun: GunDef,
  from: string,
  victimId: string,
  at: readonly [number, number, number],
  firing: RuleFiring,
): void {
  switch (firing.effect.id) {
    case "perk.damage": {
      const stacks = firing.stacks ?? 1;
      const rule = perksOf(ctx).rules.rules().find((entry) => entry.id === firing.ruleId);
      const label = labelOf(firing);
      callout(ctx, (rule?.maxStacks ?? 1) > 1 ? `${label} x${stacks}` : label);
      return;
    }
    case "perk.reload":
      callout(ctx, labelOf(firing));
      return;
    case "perk.refund": {
      const rounds = firing.effect.params?.fraction !== undefined
        ? Math.max(1, Math.ceil(effectiveMagSize(gun) * num(firing, "fraction")))
        : num(firing, "rounds", 1);
      const added = refundRounds(ctx, gun, rounds);
      if (added > 0) callout(ctx, `${labelOf(firing)} +${added}`);
      return;
    }
    case "perk.explode": {
      const radius = num(firing, "radius", 3);
      const amount = Math.max(1, Math.round(gun.weapon.damage * (gun.weapon.pellets ?? 1) * num(firing, "pct", 1)));
      ctx.scene.entity.vfx({ preset: "explosion", from: at, radius });
      ctx.scene.entity.effect({ from, at: [at[0], at[1], at[2]], radius, effect: "damage", via: { amount } });
      callout(ctx, labelOf(firing), at);
      return;
    }
    case "perk.heal": {
      if (reservePhase(ctx) === "downed") return;
      const health = ctx.scene.entity.stats.get(from, "health");
      if (health === null || health.current >= health.max) return;
      const amount = Math.max(1, Math.round(health.max * num(firing, "pct")));
      ctx.scene.entity.effect({ from, to: from, effect: "damage", via: { amount: -amount } });
      callout(ctx, `+${amount} HP`);
      return;
    }
    case "perk.shield": {
      const shield = ctx.scene.entity.stats.get(from, "shield");
      if (shield === null || shield.max <= 0 || shield.current >= shield.max) return;
      const amount = Math.min(shield.max - shield.current, Math.max(1, Math.round(shield.max * num(firing, "pct"))));
      ctx.scene.entity.stats.delta(from, "shield", amount);
      callout(ctx, `+${amount} SHIELD`);
      return;
    }
    case "perk.spread": {
      const targets = livingEnemiesNear(ctx, at, num(firing, "radius", 6), victimId).slice(0, num(firing, "count", 1));
      for (const target of targets) {
        applyDot(ctx, gun, from, target);
        ctx.scene.entity.vfx({ preset: "lightning", from: at, to: target });
      }
      if (targets.length > 0) callout(ctx, `${labelOf(firing)} x${targets.length}`, at);
      return;
    }
    default:
      shapeFrom(ctx, gun, [firing], {});
  }
}

/** Run an AoE for a gun so the kills it causes count as that gun's (launcher rounds, explosive splash). */
export function withGunKills(ctx: GameContext, gun: GunDef, from: string, land: () => void): void {
  const runtime = perksOf(ctx);
  const previous = runtime.splashGun;
  runtime.splashGun = { gun, from };
  try {
    land();
  } finally {
    runtime.splashGun = previous;
  }
}

/**
 * Run one pellet's damage and report which bodies died during it. A kill is read from the world's own
 * `entity.died`, not from the target's health afterwards, since a dead body can leave the scene at once.
 */
export function watchDeaths<T>(ctx: GameContext, land: () => T): { value: T; died: ReadonlySet<string> } {
  const runtime = perksOf(ctx);
  const previous = runtime.deathsThisHit;
  const died = new Set<string>();
  runtime.deathsThisHit = died;
  try {
    return { value: land(), died };
  } finally {
    runtime.deathsThisHit = previous;
  }
}

function isPlayerKill(ctx: GameContext, event: EntityDiedEvent): boolean {
  return event.reason.kind === "player_kill" && event.reason.killerUserId === ctx.player.userId;
}

/** A boss's own pool: a 22% roll, on its own stream, for one of its two named legendaries. */
export function dropBossLegendary(ctx: GameContext, event: EntityDiedEvent, rng: () => number = perksOf(ctx).bossRng): GunDef | null {
  const pool = bossDropFor(event.catalogId);
  if (pool === undefined || rng() >= BOSS_DROP_CHANCE) return null;
  const name = pool.legendaries[Math.min(1, Math.floor(rng() * 2))]!;
  const at = event.position;
  const level = Math.max(1, zoneLevelAt(at[0], at[2]));
  const gun = rollGun(rng, level, { legendary: name });
  ctx.scene.worldItem.spawn({
    itemId: gun.id,
    position: [at[0] + 1.5, at[1], at[2] - 1.5],
    rarity: gun.rarity,
    baseType: gun.family,
    source: "kill",
  });
  ctx.game.notices.push({ text: `${pool.boss} dropped ${gun.name}`, tone: "info" });
  return gun;
}

setMagazineHooks({ reloadScale: perkReloadScale, reloadStarted: perkReload });

/**
 * Hook the perk runtime into a session: splash kills earn their gun's kill perks, and bosses roll
 * their dedicated legendaries. Called once from `onInit`.
 */
export function registerPerks(ctx: GameContext): void {
  ctx.game.events.on("entity.died", (event) => {
    if (event.instanceId === ctx.player.userId || !isPlayerKill(ctx, event)) return;
    const runtime = perksOf(ctx);
    runtime.deathsThisHit?.add(event.instanceId);
    if (runtime.splashGun !== null) perkKill(ctx, runtime.splashGun.gun, runtime.splashGun.from, event.instanceId, false);
    dropBossLegendary(ctx, event);
  });
  // Dev-only capture affordance: hand the player a perked gun and a few husks to try it on, so a
  // capture can photograph the card and a proc without farming a boss. Never shipped.
  if (import.meta.env.DEV) {
    ctx.game.commands.define<{ legendary?: string; rarity?: "rare" | "epic" | "legendary"; husks?: number }>("perks.capture", {
      apply(state: GameContext, input) {
        stagePerkCapture(state, input.legendary, input.rarity, input.husks ?? 4);
      },
    });
  }
}

function stagePerkCapture(ctx: GameContext, legendary: string | undefined, rarity: "rare" | "epic" | "legendary" | undefined, husks: number): void {
  const userId = ctx.player.userId;
  const me = ctx.scene.entity.get(userId);
  if (me === null) return;
  const level = Math.max(1, zoneLevelAt(me.position[0], me.position[2]));
  const gun = rollGun(seededRng(`perk-capture:${legendary ?? rarity ?? "legendary"}`), level, legendary !== undefined ? { legendary } : { rarity: rarity ?? "legendary" });
  const slot = session.selectedSlot();
  const current = ctx.player.inventory.state("hotbar").slots[slot] ?? null;
  if (current !== null) ctx.player.inventory.take("hotbar", current.itemId, current.count);
  ctx.player.inventory.put("hotbar", gun.id, 1, { slot });
  lastPickupStore.write(ctx, { gunId: gun.id, atMs: nowMs(ctx) });
  // Down the line of the last shot, staggered so they arrive one at a time on the crosshair.
  const aim = perksOf(ctx).lastAim as { direction?: readonly number[]; yaw?: number } | null;
  const dx = aim?.direction?.[0] ?? Math.sin(aim?.yaw ?? me.rotationY ?? 0);
  const dz = aim?.direction?.[2] ?? Math.cos(aim?.yaw ?? me.rotationY ?? 0);
  const length = Math.hypot(dx, dz) || 1;
  for (let index = 0; index < husks; index += 1) {
    const distance = 16 + index * 8;
    const x = me.position[0] + (dx / length) * distance;
    const z = me.position[2] + (dz / length) * distance;
    ctx.scene.entity.spawn("husk", { id: `perk_husk_${nowMs(ctx).toFixed(0)}_${index}`, position: [x, ctx.world.groundHeightAt(x, z), z] });
  }
}
