import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { AbilityCastReason, AbilitySlotSnapshot } from "@jgengine/core/combat/abilityKit";
import { createAbilityKit } from "@jgengine/core/combat/abilityKit";
import { createTalentTree, type TalentTree } from "@jgengine/core/game/talents";
import { createStats, type Stats } from "@jgengine/core/stats/statModifiers";
import type { TalentNodeView } from "@jgengine/core/game/talentTreeView";

import { isHostile } from "./catalog";
import { HERO_ID, heroLevel, heroTrack, MANA_REGEN } from "./hero";
import {
  carriedPicks,
  heroPickStore,
  HERO_PICKS,
  offerFor,
  parseSavedPicks,
  pickedRanks,
  pickStats,
  type HeroPickDef,
  type HeroPickStat,
} from "./heroPicks";
import { session } from "./session";
import type { Faction } from "./tuning";
import { resolveDamage } from "./upgrades";

/**
 * Bram's acts and the field kit he carries between battles.
 *
 * Three engine seams do the work; Ember supplies the content and the effect of each act:
 * - `@jgengine/core/combat/abilityKit` owns charge/cooldown/mana gating per act (`cast` refuses a
 *   cooling slot, and `retuneSlot` is how a pick makes them recharge faster);
 * - `@jgengine/core/stats/statModifiers` owns the timed line buffs the banner and the ward ride
 *   (`addSource` with an expiry, resolved on read);
 * - `@jgengine/core/game/talents` owns the picks (points, one rank per pick, the ability and stat
 *   resolution), and `heroPicks.ts` owns the offers this vale makes.
 *
 * Battle state (cooldowns, buffs, the live tree) rides `session` and dies with the battle; the picked
 * ranks are the only hero state the campaign save keeps.
 */

/** A hero act: what the command card shows, what the kit gates, and what casting does. */
export interface HeroActDef {
  id: "thunderclap" | "banner" | "volley" | "ward";
  label: string;
  blurb: string;
  icon: string;
  hotkey: string;
  /** Mana the cast spends. */
  manaCost: number;
  cooldownSeconds: number;
  /** Radius around Bram the act reaches, in metres. Line acts affect the whole Vanguard line. */
  radius: number;
  /** True for the act Bram starts every battle with; the rest are picked at a level-up. */
  baseline?: boolean;
}

export const HERO_ACTS: readonly HeroActDef[] = [
  {
    id: "thunderclap",
    label: "Thunder Clap",
    blurb: "Bram slams the ground, bursting every Marauder around him.",
    icon: "thunder",
    hotkey: "C",
    manaCost: 40,
    cooldownSeconds: 9,
    radius: 7,
    baseline: true,
  },
  {
    id: "banner",
    label: "Banner Muster",
    blurb: "Plant the Vanguard banner: the whole line strikes 30% harder for 8s.",
    icon: "rally",
    hotkey: "4",
    manaCost: 30,
    cooldownSeconds: 24,
    radius: 0,
  },
  {
    id: "volley",
    label: "Ember Volley",
    blurb: "Signal the volley: every Marauder within reach of Bram takes a rifle burst.",
    icon: "rifleman",
    hotkey: "5",
    manaCost: 35,
    cooldownSeconds: 14,
    radius: 9,
  },
  {
    id: "ward",
    label: "Ash Ward",
    blurb: "Smother the line in ember smoke: blows land 45% softer for 6s.",
    icon: "shield",
    hotkey: "6",
    manaCost: 25,
    cooldownSeconds: 20,
    radius: 0,
  },
];

const ACT_BY_ID = new Map(HERO_ACTS.map((act) => [act.id, act]));

export const THUNDERCLAP_BASE_DMG = 26;
export const THUNDERCLAP_DMG_PER_LEVEL = 8;
export const VOLLEY_BASE_DMG = 34;
export const VOLLEY_DMG_PER_LEVEL = 6;
/** Line damage the banner adds, and how long it holds. */
export const BANNER_DAMAGE = 1.3;
export const BANNER_SECONDS = 8;
/** Damage the line takes under the ward, and how long it holds. */
export const WARD_TAKEN = 0.55;
export const WARD_SECONDS = 6;

/** Line stats the engine block resolves: damage dealt, damage taken. Base 1 so a source multiplies. */
export type HeroLineStat = "damage" | "damageTaken";

/** Battle-scoped hero runtime: the kit's cooldowns, the line's timed buffs, and the live pick tree. */
export interface HeroActsRuntime {
  kit: ReturnType<typeof createAbilityKit>;
  line: Stats<HeroLineStat>;
  picks: TalentTree<HeroPickStat>;
  /** The hero level whose pick point has already been granted. */
  pointsAtLevel: number;
  /** Max-health bonus already added to the live hero pool, so a re-apply never stacks. */
  bonusHealth: number;
}

/** The battle's hero runtime, built on first use and dropped by `resetSession`. */
export function heroRuntime(): HeroActsRuntime {
  const existing = session.heroActs;
  if (existing !== null) return existing;
  const runtime: HeroActsRuntime = {
    kit: createAbilityKit(HERO_ACTS.map((act) => ({
      id: act.id,
      cooldownMs: act.cooldownSeconds * 1000,
      resourceCost: act.manaCost,
      castType: "instant" as const,
    }))),
    line: createStats<HeroLineStat>({ damage: 1, damageTaken: 1 }, { now: () => session.elapsed * 1000 }),
    picks: createTalentTree<HeroPickStat>({ nodes: HERO_PICKS, points: 0 }),
    pointsAtLevel: heroTrack.startLevel,
    bonusHealth: 0,
  };
  session.heroActs = runtime;
  return runtime;
}

/** Acts Bram can cast: the baseline act he always has, plus whatever his picks grant. */
export function ownedActs(): ReadonlySet<string> {
  const owned = new Set<string>();
  for (const act of HERO_ACTS) if (act.baseline === true) owned.add(act.id);
  for (const id of heroRuntime().picks.resolved().abilities) owned.add(id);
  return owned;
}

/** Bram's current mana, or 0 when he is not on the field. */
export function heroMana(ctx: GameContext): number {
  const mana = ctx.scene.entity.stats.get(HERO_ID, "mana");
  return mana === null ? 0 : Math.max(0, mana.current);
}

/** Mana per second, including the draught pick. */
export function manaRegenPerSecond(): number {
  return MANA_REGEN + (pickStats(heroRuntime().picks).manaRegen?.add ?? 0);
}

/**
 * Damage scale for one hit: the banner and the zeal pick lift the Vanguard's blows, the ward and the
 * signet soften blows that land on it. Everything else resolves at 1, so research and matchups keep
 * owning their own numbers.
 */
export function lineMultiplier(attacker: Faction, defender: Faction): number {
  if (!isHostile(attacker, defender)) return 1;
  const line = heroRuntime().line;
  let scale = 1;
  if (attacker === "player") scale *= line.get("damage");
  if (defender === "player") scale *= line.get("damageTaken");
  return scale;
}

/** Push the picked passives onto the line and retune every act's cooldown for the tempo pick. */
function applyPicks(): void {
  const runtime = heroRuntime();
  const stats = pickStats(runtime.picks);
  runtime.line.addSource("pick.damage", { damage: { multiply: stats.damage?.multiply ?? 1 } });
  runtime.line.addSource("pick.incoming", { damageTaken: { multiply: stats.incoming?.multiply ?? 1 } });
  const tempo = stats.cooldown?.multiply ?? 1;
  for (const act of HERO_ACTS) {
    runtime.kit.retuneSlot(act.id, { cooldownMs: Math.round(act.cooldownSeconds * 1000 * tempo) });
  }
}

/** Every act as the command card draws it: owned or not, ready or cooling, with whole seconds left. */
export interface HeroActView extends HeroActDef {
  owned: boolean;
  ready: boolean;
  /** Whole seconds left on the cooldown, 0 when ready. */
  remaining: number;
}

export function heroActViews(ctx: GameContext): HeroActView[] {
  const runtime = heroRuntime();
  const mana = heroMana(ctx);
  const owned = ownedActs();
  const snapshots = new Map(runtime.kit.snapshot(mana).map((slot) => [slot.id, slot]));
  return HERO_ACTS.map((act) => {
    const slot: AbilitySlotSnapshot | undefined = snapshots.get(act.id);
    return {
      ...act,
      owned: owned.has(act.id),
      ready: owned.has(act.id) && (slot?.ready ?? false),
      remaining: slot === undefined ? 0 : Math.ceil(slot.cooldownRemainingMs / 1000),
    };
  });
}

/** True when the act is owned and off cooldown with the mana to pay for it. */
export function heroActReady(ctx: GameContext, id: string): boolean {
  if (session.over || ctx.scene.entity.get(HERO_ID) === null) return false;
  if (!ownedActs().has(id)) return false;
  return heroRuntime().kit.canCast(id, heroMana(ctx)).ok;
}

/** Why a cast was refused: the kit's own reasons, plus "the hero never picked it". */
export type HeroActRefusal = AbilityCastReason | "not-picked";
export type HeroActCast = { ok: true; act: HeroActDef } | { ok: false; reason: HeroActRefusal };

/** Burst every Marauder body inside `radius` of Bram. Bodies only: keeps and camps are siege work. */
function burst(ctx: GameContext, radius: number, base: number): number {
  const hero = ctx.scene.entity.get(HERO_ID);
  if (hero === null) return 0;
  const cx = hero.position[0];
  const cz = hero.position[2];
  let struck = 0;
  for (const unit of session.units.values()) {
    if (!isHostile("player", unit.faction) || unit.kind === "building") continue;
    const entity = ctx.scene.entity.get(unit.id);
    if (entity === null) continue;
    if (Math.hypot(entity.position[0] - cx, entity.position[2] - cz) > radius) continue;
    const amount = resolveDamage(base, "player", unit.faction) * lineMultiplier("player", unit.faction);
    ctx.scene.entity.effect({ from: HERO_ID, to: unit.id, effect: "damage", via: { amount } });
    struck += 1;
  }
  return struck;
}

/** Put a timed line buff on the shared stats block; a recast refreshes it rather than stacking. */
function lineBuff(sourceId: string, stat: HeroLineStat, multiply: number, seconds: number): void {
  heroRuntime().line.addSource(sourceId, { [stat]: { multiply } }, { expiresAtMs: session.elapsed * 1000 + seconds * 1000 });
}

/**
 * Cast one of Bram's acts. The kit refuses a cooling or unaffordable slot before anything happens, and
 * only an accepted cast spends mana and starts the recharge.
 */
export function castHeroAct(ctx: GameContext, id: string): HeroActCast {
  const act = ACT_BY_ID.get(id as HeroActDef["id"]);
  if (act === undefined) return { ok: false, reason: "unknown-slot" };
  if (session.over || ctx.scene.entity.get(HERO_ID) === null) return { ok: false, reason: "unknown-slot" };
  if (!ownedActs().has(id)) return { ok: false, reason: "not-picked" };

  const mana = heroMana(ctx);
  const cast = heroRuntime().kit.cast(id, mana);
  if (!cast.ok) return { ok: false, reason: cast.reason };

  ctx.scene.entity.stats.delta(HERO_ID, "mana", -act.manaCost);
  const base = id === "thunderclap"
    ? THUNDERCLAP_BASE_DMG + (heroLevel(ctx) - 1) * THUNDERCLAP_DMG_PER_LEVEL
    : VOLLEY_BASE_DMG + (heroLevel(ctx) - 1) * VOLLEY_DMG_PER_LEVEL;
  const hero = ctx.scene.entity.get(HERO_ID);
  if (id === "thunderclap") {
    ctx.game.audio.play("thunder", hero?.position);
    burst(ctx, act.radius, base);
  } else if (id === "volley") {
    ctx.game.audio.play("volley", hero?.position);
    burst(ctx, act.radius, base);
  } else if (id === "banner") {
    ctx.game.audio.play("banner", hero?.position);
    lineBuff("act.banner", "damage", BANNER_DAMAGE, BANNER_SECONDS);
  } else {
    ctx.game.audio.play("ward", hero?.position);
    lineBuff("act.ward", "damageTaken", WARD_TAKEN, WARD_SECONDS);
  }
  return { ok: true, act };
}

/**
 * The level-up offer waiting for an answer, or null when the kit is complete or the point was spent.
 * One pick is granted per level and spent in offer order, so the card never skips a level.
 */
export interface HeroOfferOption {
  id: string;
  label: string;
  blurb: string;
  icon: string;
  kind: HeroPickDef["kind"];
  /** Already in Bram's kit (a campaign card can re-offer a pick a later battle already took). */
  taken: boolean;
  /** Whether the model would accept this pick right now. */
  allocatable: boolean;
}

export interface HeroOffer {
  level: number;
  options: readonly [HeroOfferOption, HeroOfferOption];
}

function offerOption(view: TalentNodeView): HeroOfferOption {
  const def = HERO_PICKS.find((node) => node.id === view.id)!;
  return {
    id: def.id,
    label: def.label,
    blurb: def.blurb,
    icon: def.icon,
    kind: def.kind,
    taken: view.rank > 0,
    allocatable: view.allocatable,
  };
}

export function pendingHeroOffer(ctx: GameContext): HeroOffer | null {
  if (session.over || ctx.scene.entity.get(HERO_ID) === null) return null;
  const runtime = heroRuntime();
  if (runtime.picks.pointsAvailable() <= 0) return null;
  const offer = offerFor(runtime.picks);
  if (offer === null) return null;
  return { level: offer.level, options: [offerOption(offer.options[0]!), offerOption(offer.options[1]!)] };
}

/** Take one of the two offered picks. A pick outside the live offer is refused, not force-spent. */
export function chooseHeroPick(ctx: GameContext, id: string): boolean {
  const runtime = heroRuntime();
  const offer = pendingHeroOffer(ctx);
  if (offer === null || !offer.options.some((option) => option.id === id)) return false;
  if (!runtime.picks.allocate(id).ok) return false;
  applyPicks();
  heroPickStore.write(ctx, pickedRanks(runtime.picks));
  const def = HERO_PICKS.find((node) => node.id === id);
  ctx.game.audio.play("muster");
  ctx.game.notices.push({ text: `${def?.label ?? id} joins Bram's kit.`, tone: "success", ttlMs: 7000 });
  return true;
}

/** The picks Bram carries into this battle, for the command card's kit line. */
export function carriedHeroPicks(): readonly HeroPickDef[] {
  return carriedPicks(heroRuntime().picks);
}

/**
 * Load the saved kit into this battle. A saved pick this build does not author fails here, at load,
 * before any act or offer reaches play.
 */
export function restoreHeroPicks(ctx: GameContext): void {
  const saved = heroPickStore.peek(ctx);
  const ranks = parseSavedPicks(saved ?? {});
  const runtime = heroRuntime();
  runtime.picks.hydrate({ points: 0, ranks });
  // A battle starts with the kit it carried in, not with the points an earlier battle left unspent.
  runtime.pointsAtLevel = heroLevel(ctx);
  runtime.bonusHealth = 0;
  applyPicks();
}

/**
 * Boot/restage entry: a stale save is reported and dropped rather than leaving an unplayable field
 * desk. `restoreHeroPicks` stays the strict call, so the failure is still a load-time one.
 */
export function loadHeroPicks(ctx: GameContext): void {
  try {
    restoreHeroPicks(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    heroPickStore.clear(ctx);
    heroRuntime().picks.hydrate({ points: 0, ranks: {} });
    applyPicks();
    ctx.game.notices.push({ text: `Saved field kit discarded — ${message}.`, tone: "deny", ttlMs: 12000 });
  }
}

/** Grant the pick point a hero level earns, without needing a level-up callback wired in. */
function reconcilePickPoints(ctx: GameContext): void {
  const runtime = heroRuntime();
  const level = heroLevel(ctx);
  while (runtime.pointsAtLevel < level) {
    runtime.pointsAtLevel += 1;
    runtime.picks.grantPoints(1);
  }
}

/** Add (or remove) the standard pick's max health on the live pool exactly once. */
function reconcileBonusHealth(ctx: GameContext, runtime: HeroActsRuntime): void {
  const want = pickStats(runtime.picks).maxHealth?.add ?? 0;
  if (runtime.bonusHealth === want) return;
  const health = ctx.scene.entity.stats.get(HERO_ID, "health");
  if (health === null) return;
  const delta = want - runtime.bonusHealth;
  ctx.scene.entity.stats.set(HERO_ID, "health", { max: health.max + delta, current: health.current + delta });
  runtime.bonusHealth = want;
}

/** Per-frame hero upkeep: cooldowns, buff expiry, the pick point a level earns, and mana. */
export function tickHero(ctx: GameContext, dt: number): void {
  if (session.over) return;
  const runtime = heroRuntime();
  runtime.kit.tick(dt);
  runtime.line.pruneExpired(session.elapsed * 1000);
  reconcilePickPoints(ctx);
  if (ctx.scene.entity.get(HERO_ID) === null) return;
  reconcileBonusHealth(ctx, runtime);
  const mana = ctx.scene.entity.stats.get(HERO_ID, "mana");
  if (mana !== null && mana.current < mana.max) {
    ctx.scene.entity.stats.delta(HERO_ID, "mana", manaRegenPerSecond() * dt);
  }
}
