export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type AmmoPool = "light" | "heavy" | "shell" | "energy";
export type WeaponFamily =
  | "pistol"
  | "smg"
  | "shotgun"
  | "rifle"
  | "dmr"
  | "beam"
  | "launcher"
  | "railgun";

export interface WeaponStats {
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

export interface WeaponBaseDef {
  family: WeaponFamily;
  name: string;
  ammo: AmmoPool;
  auto: boolean;
  ammoPerShot: number;
  legendaryName: string;
  magazineSize: number;
  reloadMs: number;
  stats: WeaponStats;
}

export const WEAPON_BASES: readonly WeaponBaseDef[] = [
  {
    family: "pistol",
    name: "Scrap Iron",
    ammo: "light",
    auto: false,
    ammoPerShot: 1,
    legendaryName: "Iron Oath",
    magazineSize: 12,
    reloadMs: 950,
    stats: { damage: 22, range: 55, spread: 1.1, fireIntervalMs: 240, critChance: 0.14, critMult: 1.7 },
  },
  {
    family: "smg",
    name: "Hornet",
    ammo: "light",
    auto: true,
    ammoPerShot: 1,
    legendaryName: "Wasp Chorus",
    magazineSize: 30,
    reloadMs: 1400,
    stats: { damage: 9, range: 40, spread: 3.4, fireIntervalMs: 88, critChance: 0.08, critMult: 1.5 },
  },
  {
    family: "shotgun",
    name: "Riot Maw",
    ammo: "shell",
    auto: false,
    ammoPerShot: 1,
    legendaryName: "Doorbreaker",
    magazineSize: 6,
    reloadMs: 2200,
    stats: { damage: 8, range: 22, spread: 6.5, fireIntervalMs: 720, critChance: 0.05, critMult: 1.5, pellets: 8 },
  },
  {
    family: "rifle",
    name: "Longarm",
    ammo: "heavy",
    auto: true,
    ammoPerShot: 1,
    legendaryName: "Warcry",
    magazineSize: 30,
    reloadMs: 1800,
    stats: { damage: 16, range: 70, spread: 1.9, fireIntervalMs: 132, critChance: 0.1, critMult: 1.6 },
  },
  {
    family: "dmr",
    name: "Spindle",
    ammo: "heavy",
    auto: false,
    ammoPerShot: 2,
    legendaryName: "Quiet Argument",
    magazineSize: 8,
    reloadMs: 2000,
    stats: { damage: 48, range: 95, spread: 0.35, fireIntervalMs: 560, critChance: 0.25, critMult: 2.1 },
  },
  {
    family: "beam",
    name: "Pulse Lance",
    ammo: "energy",
    auto: true,
    ammoPerShot: 1,
    legendaryName: "Sunspill",
    magazineSize: 40,
    reloadMs: 1600,
    stats: { damage: 12, range: 60, spread: 0.8, fireIntervalMs: 108, critChance: 0.1, critMult: 1.6 },
  },
  {
    family: "launcher",
    name: "Boomdog",
    ammo: "shell",
    auto: false,
    ammoPerShot: 2,
    legendaryName: "Fireworks Permit",
    magazineSize: 4,
    reloadMs: 2400,
    stats: {
      damage: 55,
      range: 45,
      spread: 0.6,
      fireIntervalMs: 1050,
      critChance: 0.05,
      critMult: 1.5,
      projectile: { speed: 22, fuseTime: 1.6 },
      explosion: { radius: 4.5 },
    },
  },
  {
    family: "railgun",
    name: "Threnody",
    ammo: "energy",
    auto: false,
    ammoPerShot: 4,
    legendaryName: "Horizon Cutter",
    magazineSize: 4,
    reloadMs: 2600,
    stats: { damage: 90, range: 120, spread: 0, fireIntervalMs: 1250, critChance: 0.2, critMult: 2.0 },
  },
];

export interface RarityTierDef {
  id: Rarity;
  prefix: string;
  damageMult: number;
  intervalMult: number;
  spreadMult: number;
  critBonus: number;
  dropWeight: number;
}

export const RARITY_TIERS: readonly RarityTierDef[] = [
  { id: "common", prefix: "", damageMult: 1, intervalMult: 1, spreadMult: 1, critBonus: 0, dropWeight: 100 },
  { id: "uncommon", prefix: "Tuned", damageMult: 1.15, intervalMult: 0.96, spreadMult: 0.92, critBonus: 0.02, dropWeight: 55 },
  { id: "rare", prefix: "Vector", damageMult: 1.32, intervalMult: 0.92, spreadMult: 0.84, critBonus: 0.04, dropWeight: 26 },
  { id: "epic", prefix: "Phantom", damageMult: 1.55, intervalMult: 0.88, spreadMult: 0.75, critBonus: 0.07, dropWeight: 10 },
  { id: "legendary", prefix: "", damageMult: 1.85, intervalMult: 0.82, spreadMult: 0.65, critBonus: 0.1, dropWeight: 3 },
];

export const RARITY_ORDER: readonly Rarity[] = RARITY_TIERS.map((tier) => tier.id);

export interface WeaponItemDef {
  id: string;
  name: string;
  kind: "weapon";
  family: WeaponFamily;
  rarity: Rarity;
  ammo: AmmoPool;
  auto: boolean;
  ammoPerShot: number;
  magazineSize: number;
  reloadMs: number;
  use: "fireGun";
  weapon: WeaponStats;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function weaponName(base: WeaponBaseDef, tier: RarityTierDef): string {
  if (tier.id === "legendary") return base.legendaryName;
  return tier.prefix === "" ? base.name : `${tier.prefix} ${base.name}`;
}

function buildWeapon(base: WeaponBaseDef, tier: RarityTierDef): WeaponItemDef {
  const stats = base.stats;
  return {
    id: `${base.family}_${tier.id}`,
    name: weaponName(base, tier),
    kind: "weapon",
    family: base.family,
    rarity: tier.id,
    ammo: base.ammo,
    auto: base.auto,
    ammoPerShot: base.ammoPerShot,
    magazineSize: base.magazineSize,
    reloadMs: base.reloadMs,
    use: "fireGun",
    weapon: {
      damage: Math.round(stats.damage * tier.damageMult),
      range: stats.range,
      spread: round(stats.spread * tier.spreadMult),
      fireIntervalMs: Math.round(stats.fireIntervalMs * tier.intervalMult),
      critChance: round(stats.critChance + tier.critBonus),
      critMult: stats.critMult,
      ...(stats.pellets !== undefined ? { pellets: stats.pellets } : {}),
      ...(stats.projectile !== undefined ? { projectile: stats.projectile } : {}),
      ...(stats.explosion !== undefined ? { explosion: stats.explosion } : {}),
    },
  };
}

export const weapons: readonly WeaponItemDef[] = WEAPON_BASES.flatMap((base) =>
  RARITY_TIERS.map((tier) => buildWeapon(base, tier)),
);

const weaponsByIdMap = new Map(weapons.map((weapon) => [weapon.id, weapon]));

export function weaponById(id: string): WeaponItemDef | undefined {
  return weaponsByIdMap.get(id);
}

export const STARTER_WEAPON_ID = "pistol_common";
