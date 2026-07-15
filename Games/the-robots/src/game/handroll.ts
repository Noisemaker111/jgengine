import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMMO_STAT_IDS, type AmmoPool } from "./ammo";
import { bonus } from "./characters";
import { ffylStore } from "./stores";

export type GunFamily = "pistol" | "smg" | "shotgun" | "rifle" | "sniper" | "launcher";
export type GunElement = "none" | "incendiary" | "shock" | "corrosive" | "explosive" | "flux";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Surface = "flesh" | "armor";

export interface GunWeaponStats {
  damage: number;
  range: number;
  spread: number;
  fireIntervalMs: number;
  critChance: number;
  critMult: number;
  pellets?: number;
  projectile?: { speed: number; fuseTime: number };
  explosion?: { radius: number };
}

export interface GunDef {
  id: string;
  kind: "gun";
  name: string;
  family: GunFamily;
  manufacturer: string;
  rarity: Rarity;
  element: GunElement;
  level: number;
  ammo: AmmoPool;
  auto: boolean;
  ammoPerShot: number;
  magSize: number;
  reloadMs: number;
  elementChance: number;
  elementDps: number;
  use: "fireGun";
  weapon: GunWeaponStats;
}

interface FamilyBase {
  family: GunFamily;
  ammo: AmmoPool;
  auto: boolean;
  ammoPerShot: number;
  magSize: number;
  reloadMs: number;
  nouns: readonly string[];
  stats: GunWeaponStats;
}

const FAMILY_BASES: readonly FamilyBase[] = [
  {
    family: "pistol",
    ammo: "pistol",
    auto: false,
    ammoPerShot: 1,
    magSize: 12,
    reloadMs: 1200,
    nouns: ["Iron", "Law", "Rex", "Anaconda", "Repeater"],
    stats: { damage: 14, range: 60, spread: 1.4, fireIntervalMs: 260, critChance: 0.15, critMult: 2 },
  },
  {
    family: "smg",
    ammo: "smg",
    auto: true,
    ammoPerShot: 1,
    magSize: 28,
    reloadMs: 1600,
    nouns: ["Bane", "Sting", "Gospel", "Transmurdera", "Chulainn"],
    stats: { damage: 6, range: 42, spread: 3.2, fireIntervalMs: 92, critChance: 0.09, critMult: 1.7 },
  },
  {
    family: "shotgun",
    ammo: "shotgun",
    auto: false,
    ammoPerShot: 1,
    magSize: 6,
    reloadMs: 2200,
    nouns: ["Ravager", "Coach Gun", "Striker", "Bushwack", "Jolly Roger"],
    stats: { damage: 5, range: 24, spread: 6.8, fireIntervalMs: 760, critChance: 0.06, critMult: 1.6, pellets: 9 },
  },
  {
    family: "rifle",
    ammo: "rifle",
    auto: true,
    ammoPerShot: 1,
    magSize: 32,
    reloadMs: 1900,
    nouns: ["Spinigun", "Rifle", "Carbine", "Havoc", "Renegade"],
    stats: { damage: 10, range: 72, spread: 2, fireIntervalMs: 128, critChance: 0.1, critMult: 1.8 },
  },
  {
    family: "sniper",
    ammo: "sniper",
    auto: false,
    ammoPerShot: 1,
    magSize: 5,
    reloadMs: 2600,
    nouns: ["Muckamuck", "Droog", "Snider", "Diaub", "Railer"],
    stats: { damage: 42, range: 130, spread: 0.25, fireIntervalMs: 900, critChance: 0.3, critMult: 2.5 },
  },
  {
    family: "launcher",
    ammo: "rocket",
    auto: false,
    ammoPerShot: 1,
    magSize: 3,
    reloadMs: 3200,
    nouns: ["Bazooka", "Roaster", "Mongol", "Hive", "Partisan"],
    stats: {
      damage: 60,
      range: 60,
      spread: 0.6,
      fireIntervalMs: 1200,
      critChance: 0.05,
      critMult: 1.5,
      projectile: { speed: 26, fuseTime: 1.4 },
      explosion: { radius: 4.6 },
    },
  },
];

interface Manufacturer {
  id: string;
  damage: number;
  interval: number;
  spread: number;
  mag: number;
  reload: number;
  forcedElement?: GunElement;
  neverElemental?: boolean;
  prefixes: readonly string[];
}

const MANUFACTURERS: readonly Manufacturer[] = [
  { id: "Blackwood", damage: 1.3, interval: 1.25, spread: 0.9, mag: 0.8, reload: 1.1, neverElemental: true, prefixes: ["Cowboy", "Buffalo", "Doc's", "Frontier"] },
  { id: "Apex", damage: 1, interval: 1, spread: 0.6, mag: 1, reload: 0.95, prefixes: ["Corporate", "Crowdsourced", "Visionary", "Future"] },
  { id: "Voltek", damage: 0.95, interval: 1, spread: 0.85, mag: 1, reload: 1, forcedElement: undefined, prefixes: ["Pyrotechnic", "Refined", "Proactive", "Elegant"] },
  { id: "Chuckwerk", damage: 0.9, interval: 0.95, spread: 1.05, mag: 0.9, reload: 0.45, prefixes: ["Bargain", "Value", "Practical", "Budget"] },
  { id: "Detonic", damage: 1.2, interval: 1.15, spread: 1.15, mag: 1, reload: 1.15, forcedElement: "explosive", prefixes: ["EXPLOSIVE", "Ferocious", "Original", "Wild"] },
  { id: "Ironworks", damage: 0.85, interval: 0.6, spread: 1.1, mag: 1.3, reload: 1, prefixes: ["Patriot's", "Rabid", "Worker's", "Surplus"] },
  { id: "Vanguard", damage: 0.95, interval: 0.9, spread: 0.75, mag: 1, reload: 0.9, prefixes: ["Military", "Operational", "Scout's", "Stoic"] },
  { id: "Scrapjack", damage: 1.05, interval: 1.05, spread: 1.3, mag: 1.7, reload: 1.25, prefixes: ["Murduring", "Extra Big", "Bonus", "Stabbing"] },
];

interface RarityTier {
  id: Rarity;
  mult: number;
  weight: number;
  elementChance: number;
}

export const RARITY_TIERS: readonly RarityTier[] = [
  { id: "common", mult: 1, weight: 100, elementChance: 0 },
  { id: "uncommon", mult: 1.15, weight: 45, elementChance: 0.25 },
  { id: "rare", mult: 1.35, weight: 18, elementChance: 0.5 },
  { id: "epic", mult: 1.6, weight: 6, elementChance: 0.75 },
  { id: "legendary", mult: 2, weight: 1.4, elementChance: 0.9 },
];

const LEGENDARY_NAMES: Record<GunFamily, readonly (readonly [string, string])[]> = {
  pistol: [["Detonic", "Ravager"], ["Ironworks", "Endless"], ["Blackwood", "Sixgun"]],
  smg: [["Voltek", "Cinder"], ["Scrapjack", "Fluxer"], ["Apex", "Chatterbox"]],
  shotgun: [["Apex", "Broadcast"], ["Detonic", "Flakcannon"], ["Scrapjack", "Sledgehammer"]],
  rifle: [["Ironworks", "Shredder"], ["Blackwood", "Piledriver"], ["Vanguard", "Vandal"]],
  sniper: [["Ironworks", "Longshot"], ["Voltek", "Ashfall"], ["Blackwood", "Skullsplit"]],
  launcher: [["Scrapjack", "Kaboom"], ["Voltek", "Starfall"], ["Detonic", "Fallout"]],
};

const ELEMENTS: readonly GunElement[] = ["incendiary", "shock", "corrosive", "flux"];

const ELEMENT_PREFIX: Record<GunElement, string> = {
  none: "",
  incendiary: "Burning",
  shock: "Static",
  corrosive: "Caustic",
  explosive: "Explosive",
  flux: "Fluxed",
};

export const LEVEL_DAMAGE_GROWTH = 1.13;

const gunRegistry = new Map<string, GunDef>();
let gunSerial = 0;

export function gunById(id: string): GunDef | undefined {
  return gunRegistry.get(id);
}

export function registerGun(def: GunDef): GunDef {
  gunRegistry.set(def.id, def);
  return def;
}

export function allGuns(): readonly GunDef[] {
  return [...gunRegistry.values()];
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  const entry = list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  if (entry === undefined) throw new Error("pick: empty list");
  return entry;
}

export function rollRarity(rng: () => number, luck = 1): Rarity {
  const total = RARITY_TIERS.reduce((sum, tier) => sum + tier.weight * (tier.id === "common" ? 1 : luck), 0);
  let roll = rng() * total;
  for (const tier of RARITY_TIERS) {
    roll -= tier.weight * (tier.id === "common" ? 1 : luck);
    if (roll <= 0) return tier.id;
  }
  return "common";
}

export interface RollGunOptions {
  rarity?: Rarity;
  family?: GunFamily;
  level?: number;
  luck?: number;
}

export function rollGun(rng: () => number, level: number, options: RollGunOptions = {}): GunDef {
  const base = options.family !== undefined
    ? FAMILY_BASES.find((candidate) => candidate.family === options.family) ?? pick(rng, FAMILY_BASES)
    : pick(rng, FAMILY_BASES);
  const rarity = options.rarity ?? rollRarity(rng, options.luck ?? 1);
  const tier = RARITY_TIERS.find((candidate) => candidate.id === rarity) ?? RARITY_TIERS[0]!;

  let manufacturer: Manufacturer;
  let legendaryName: string | null = null;
  if (rarity === "legendary") {
    const [makerId, name] = pick(rng, LEGENDARY_NAMES[base.family]);
    manufacturer = MANUFACTURERS.find((candidate) => candidate.id === makerId) ?? pick(rng, MANUFACTURERS);
    legendaryName = name;
  } else {
    manufacturer = pick(rng, MANUFACTURERS);
  }

  let element: GunElement = "none";
  if (manufacturer.neverElemental !== true) {
    if (manufacturer.forcedElement !== undefined) element = manufacturer.forcedElement;
    else if (manufacturer.id === "Voltek" || rng() < tier.elementChance) element = pick(rng, ELEMENTS);
  }

  const gunLevel = options.level ?? level;
  const levelMult = LEVEL_DAMAGE_GROWTH ** (gunLevel - 1);
  const jitter = 0.92 + rng() * 0.16;
  const damage = Math.max(1, Math.round(base.stats.damage * tier.mult * manufacturer.damage * levelMult * jitter));
  const magSize = Math.max(2, Math.round(base.magSize * manufacturer.mag));
  const elementPrefix = element === "none" ? "" : `${ELEMENT_PREFIX[element]} `;
  const name = legendaryName !== null
    ? `${elementPrefix}${legendaryName}`
    : `${elementPrefix}${pick(rng, manufacturer.prefixes)} ${pick(rng, base.nouns)}`;

  gunSerial += 1;
  const def: GunDef = {
    id: `gun_${gunSerial}_${base.family}_${rarity}`,
    kind: "gun",
    name,
    family: base.family,
    manufacturer: manufacturer.id,
    rarity,
    element,
    level: gunLevel,
    ammo: base.ammo,
    auto: base.auto,
    ammoPerShot: base.ammoPerShot,
    magSize,
    reloadMs: Math.round(base.reloadMs * manufacturer.reload),
    elementChance: element === "none" ? 0 : element === "explosive" ? 1 : 0.25 + tier.elementChance * 0.4,
    elementDps: Math.max(1, Math.round(damage * 0.35)),
    use: "fireGun",
    weapon: {
      damage,
      range: base.stats.range,
      spread: Math.round(base.stats.spread * manufacturer.spread * (rarity === "legendary" ? 0.7 : 1) * 100) / 100,
      fireIntervalMs: Math.max(60, Math.round(base.stats.fireIntervalMs * manufacturer.interval * (2 - tier.mult))),
      critChance: Math.min(0.5, base.stats.critChance + (tier.mult - 1) * 0.08),
      critMult: base.stats.critMult,
      ...(base.stats.pellets !== undefined ? { pellets: base.stats.pellets } : {}),
      ...(base.stats.projectile !== undefined ? { projectile: base.stats.projectile } : {}),
      ...(element === "explosive" && base.family !== "launcher" ? { explosion: { radius: 2.2 } } : {}),
      ...(base.stats.explosion !== undefined ? { explosion: base.stats.explosion } : {}),
    },
  };
  return registerGun(def);
}

interface MagState {
  inMag: number;
  reloadingUntilMs: number;
}

const magazines = new Map<string, MagState>();

export function effectiveMagSize(gun: GunDef): number {
  return Math.max(1, Math.round(gun.magSize * (1 + bonus("magSize"))));
}

export function effectiveReloadMs(gun: GunDef): number {
  return Math.round(gun.reloadMs / (1 + bonus("reloadSpeed")));
}

export function magState(gun: GunDef): MagState {
  let state = magazines.get(gun.id);
  if (state === undefined) {
    state = { inMag: effectiveMagSize(gun), reloadingUntilMs: 0 };
    magazines.set(gun.id, state);
  }
  return state;
}

export function isReloading(gun: GunDef, nowMs: number): boolean {
  return magState(gun).reloadingUntilMs > nowMs;
}

export function startReload(ctx: GameContext, gun: GunDef, nowMs: number): boolean {
  const state = magState(gun);
  if (state.reloadingUntilMs > nowMs) return false;
  const reserve = ctx.scene.entity.stats.get(ctx.player.userId, AMMO_STAT_IDS[gun.ammo]);
  if (state.inMag >= effectiveMagSize(gun) || reserve === null || reserve.current <= 0) return false;
  state.reloadingUntilMs = nowMs + effectiveReloadMs(gun);
  return true;
}

export function finishReloads(ctx: GameContext, nowMs: number): void {
  for (const [gunId, state] of magazines) {
    if (state.reloadingUntilMs === 0 || state.reloadingUntilMs > nowMs) continue;
    const gun = gunRegistry.get(gunId);
    if (gun === undefined) continue;
    const statId = AMMO_STAT_IDS[gun.ammo];
    const reserve = ctx.scene.entity.stats.get(ctx.player.userId, statId);
    if (reserve === null) continue;
    const wanted = effectiveMagSize(gun) - state.inMag;
    const taken = Math.min(wanted, reserve.current);
    if (taken > 0) {
      ctx.scene.entity.stats.delta(ctx.player.userId, statId, -taken);
      state.inMag += taken;
    }
    state.reloadingUntilMs = 0;
  }
}

export function consumeRound(gun: GunDef): boolean {
  const state = magState(gun);
  if (state.inMag < gun.ammoPerShot) return false;
  state.inMag -= gun.ammoPerShot;
  return true;
}

export interface ShieldWatch {
  lastHitAtMs: number;
  lastShield: number;
  lastHealth: number;
}

const shieldWatch = new Map<string, ShieldWatch>();

export const SHIELD_REGEN_DELAY_MS = 5000;

export function tickShields(ctx: GameContext, nowMs: number, dt: number, regenBonus = 1): void {
  for (const entity of ctx.scene.entity.list()) {
    const shield = ctx.scene.entity.stats.get(entity.id, "shield");
    if (shield === null || shield.max <= 0) continue;
    const health = ctx.scene.entity.stats.get(entity.id, "health");
    let watch = shieldWatch.get(entity.id);
    if (watch === undefined) {
      watch = { lastHitAtMs: 0, lastShield: shield.current, lastHealth: health?.current ?? 0 };
      shieldWatch.set(entity.id, watch);
    }
    const currentHealth = health?.current ?? 0;
    if (shield.current < watch.lastShield || currentHealth < watch.lastHealth) {
      watch.lastHitAtMs = nowMs;
      if (entity.id === ctx.player.userId) notePlayerHurt(nowMs);
    }
    watch.lastShield = shield.current;
    watch.lastHealth = currentHealth;
    if (shield.current >= shield.max) continue;
    const isLocalPlayer = entity.id === ctx.player.userId;
    const delay = isLocalPlayer
      ? SHIELD_REGEN_DELAY_MS * (1 - Math.min(0.6, bonus("shieldDelay")))
      : SHIELD_REGEN_DELAY_MS;
    if (nowMs - watch.lastHitAtMs < delay) continue;
    const rate = Math.max(6, shield.max * 0.12) * regenBonus * (isLocalPlayer ? 1 + bonus("shieldRegen") : 1);
    ctx.scene.entity.stats.delta(entity.id, "shield", rate * dt);
    watch.lastShield = ctx.scene.entity.stats.get(entity.id, "shield")?.current ?? shield.current;
  }
}

interface DotEntry {
  targetId: string;
  fromId: string;
  element: GunElement;
  dps: number;
  untilMs: number;
  nextTickMs: number;
}

const activeDots: DotEntry[] = [];
const fluxedUntil = new Map<string, number>();

export const DOT_DURATION_MS = 4000;
export const FLUX_DURATION_MS = 8000;
export const FLUX_DAMAGE_MULT = 2;

export function isFluxed(targetId: string, nowMs: number): boolean {
  return (fluxedUntil.get(targetId) ?? 0) > nowMs;
}

export function elementalDamageMult(
  element: GunElement,
  surface: Surface,
  targetShielded: boolean,
  targetId: string,
  nowMs: number,
): number {
  let mult = 1;
  if (targetShielded) {
    mult = element === "shock" ? 2 : element === "none" || element === "explosive" ? 1 : 0.75;
  } else if (surface === "armor") {
    mult = element === "corrosive" ? 1.5 : element === "incendiary" ? 0.75 : 1;
  } else {
    mult = element === "incendiary" ? 1.5 : element === "corrosive" ? 0.9 : 1;
  }
  if (isFluxed(targetId, nowMs) && element !== "flux") mult *= FLUX_DAMAGE_MULT;
  return mult;
}

export function applyElementalProc(
  rng: () => number,
  gun: GunDef,
  fromId: string,
  targetId: string,
  nowMs: number,
): void {
  if (gun.element === "none" || gun.element === "explosive") return;
  if (rng() >= gun.elementChance + bonus("elementChance")) return;
  if (gun.element === "flux") {
    fluxedUntil.set(targetId, nowMs + FLUX_DURATION_MS);
    return;
  }
  activeDots.push({
    targetId,
    fromId,
    element: gun.element,
    dps: Math.round(gun.elementDps * (1 + bonus("dotDamage"))),
    untilMs: nowMs + DOT_DURATION_MS,
    nextTickMs: nowMs + 500,
  });
}

let playerHurtAtMs = 0;

function notePlayerHurt(nowMs: number): void {
  playerHurtAtMs = nowMs;
}

export function playerLastHurtAtMs(): number {
  return playerHurtAtMs;
}

export function tickDots(ctx: GameContext, nowMs: number): void {
  for (let index = activeDots.length - 1; index >= 0; index -= 1) {
    const dot = activeDots[index]!;
    if (nowMs >= dot.untilMs || ctx.scene.entity.get(dot.targetId) === null) {
      activeDots.splice(index, 1);
      continue;
    }
    if (nowMs < dot.nextTickMs) continue;
    dot.nextTickMs = nowMs + 500;
    ctx.scene.entity.effect({
      from: dot.fromId,
      to: dot.targetId,
      effect: "damage",
      via: { amount: Math.max(1, Math.round(dot.dps / 2)) },
    });
  }
}

export type FfylPhase = "up" | "downed" | "dead";

export interface FfylState {
  phase: FfylPhase;
  downedUntilMs: number;
}

const ffyl: FfylState = { phase: "up", downedUntilMs: 0 };

export const FFYL_WINDOW_MS = 12000;
export const SECOND_WIND_HEALTH_FRACTION = 0.4;
export const RESPAWN_CASH_FRACTION = 0.07;

export function ffylPhase(): FfylPhase {
  return ffyl.phase;
}

export function enterDowned(ctx: GameContext, nowMs: number): void {
  ffyl.phase = "downed";
  ffyl.downedUntilMs = nowMs + FFYL_WINDOW_MS * (1 + bonus("ffylTime"));
  ffylStore.write(ctx, { phase: "downed", untilMs: ffyl.downedUntilMs });
}

export function secondWind(ctx: GameContext): void {
  const userId = ctx.player.userId;
  ffyl.phase = "up";
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) {
    const fraction = SECOND_WIND_HEALTH_FRACTION * (1 + bonus("secondWindHeal"));
    ctx.scene.entity.stats.delta(userId, "health", Math.round(health.max * fraction));
  }
  const shield = ctx.scene.entity.stats.get(userId, "shield");
  if (shield !== null) ctx.scene.entity.stats.delta(userId, "shield", Math.round(shield.max * 0.5));
  ffylStore.write(ctx, { phase: "up", untilMs: 0 });
}

export function ffylExpired(nowMs: number): boolean {
  return ffyl.phase === "downed" && nowMs >= ffyl.downedUntilMs;
}

export function markRespawned(ctx: GameContext): void {
  ffyl.phase = "up";
  ffylStore.write(ctx, { phase: "up", untilMs: 0 });
}

export function resetHandrollState(): void {
  magazines.clear();
  shieldWatch.clear();
  activeDots.length = 0;
  fluxedUntil.clear();
  ffyl.phase = "up";
  ffyl.downedUntilMs = 0;
}
