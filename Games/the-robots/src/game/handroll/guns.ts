import type { AmmoPool } from "../ammo";

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

export interface FamilyBase {
  family: GunFamily;
  ammo: AmmoPool;
  auto: boolean;
  ammoPerShot: number;
  magSize: number;
  reloadMs: number;
  nouns: readonly string[];
  stats: GunWeaponStats;
}

export const FAMILY_BASES: readonly FamilyBase[] = [
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

export interface Manufacturer {
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

export const MANUFACTURERS: readonly Manufacturer[] = [
  { id: "Blackwood", damage: 1.3, interval: 1.25, spread: 0.9, mag: 0.8, reload: 1.1, neverElemental: true, prefixes: ["Cowboy", "Buffalo", "Doc's", "Frontier"] },
  { id: "Apex", damage: 1, interval: 1, spread: 0.6, mag: 1, reload: 0.95, prefixes: ["Corporate", "Crowdsourced", "Visionary", "Future"] },
  { id: "Voltek", damage: 0.95, interval: 1, spread: 0.85, mag: 1, reload: 1, forcedElement: undefined, prefixes: ["Pyrotechnic", "Refined", "Proactive", "Elegant"] },
  { id: "Chuckwerk", damage: 0.9, interval: 0.95, spread: 1.05, mag: 0.9, reload: 0.45, prefixes: ["Bargain", "Value", "Practical", "Budget"] },
  { id: "Detonic", damage: 1.2, interval: 1.15, spread: 1.15, mag: 1, reload: 1.15, forcedElement: "explosive", prefixes: ["EXPLOSIVE", "Ferocious", "Original", "Wild"] },
  { id: "Ironworks", damage: 0.85, interval: 0.6, spread: 1.1, mag: 1.3, reload: 1, prefixes: ["Patriot's", "Rabid", "Worker's", "Surplus"] },
  { id: "Vanguard", damage: 0.95, interval: 0.9, spread: 0.75, mag: 1, reload: 0.9, prefixes: ["Military", "Operational", "Scout's", "Stoic"] },
  { id: "Scrapjack", damage: 1.05, interval: 1.05, spread: 1.3, mag: 1.7, reload: 1.25, prefixes: ["Murduring", "Extra Big", "Bonus", "Stabbing"] },
];

export interface RarityTier {
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

export const LEGENDARY_NAMES: Record<GunFamily, readonly (readonly [string, string])[]> = {
  pistol: [["Detonic", "Ravager"], ["Ironworks", "Endless"], ["Blackwood", "Sixgun"]],
  smg: [["Voltek", "Cinder"], ["Scrapjack", "Fluxer"], ["Apex", "Chatterbox"]],
  shotgun: [["Apex", "Broadcast"], ["Detonic", "Flakcannon"], ["Scrapjack", "Sledgehammer"]],
  rifle: [["Ironworks", "Shredder"], ["Blackwood", "Piledriver"], ["Vanguard", "Vandal"]],
  sniper: [["Ironworks", "Longshot"], ["Voltek", "Ashfall"], ["Blackwood", "Skullsplit"]],
  launcher: [["Scrapjack", "Kaboom"], ["Voltek", "Starfall"], ["Detonic", "Fallout"]],
};

export const ELEMENTS: readonly GunElement[] = ["incendiary", "shock", "corrosive", "flux"];

export const ELEMENT_PREFIX: Record<GunElement, string> = {
  none: "",
  incendiary: "Burning",
  shock: "Static",
  corrosive: "Caustic",
  explosive: "Explosive",
  flux: "Fluxed",
};

export const LEVEL_DAMAGE_GROWTH = 1.13;
