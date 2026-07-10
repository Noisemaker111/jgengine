import type { AmmoPool, WeaponStats } from "../weapons/catalog";

export interface GearItemDef {
  id: string;
  name: string;
  kind: "gear" | "ammo";
  use?: string;
  heal?: number;
  ammo?: AmmoPool;
  ammoAmount?: number;
  weapon?: WeaponStats;
}

export const frag_grenade: GearItemDef = {
  id: "frag_grenade",
  name: "Frag Grenade",
  kind: "gear",
  use: "throwGrenade",
  weapon: {
    damage: 70,
    range: 32,
    spread: 0,
    fireIntervalMs: 900,
    critChance: 0,
    critMult: 1,
    projectile: { speed: 17, fuseTime: 1.4 },
    explosion: { radius: 5 },
  },
};

export const medkit_small: GearItemDef = {
  id: "medkit_small",
  name: "Field Patch",
  kind: "gear",
  use: "useMedkit",
  heal: 35,
};

export const medkit_large: GearItemDef = {
  id: "medkit_large",
  name: "Trauma Kit",
  kind: "gear",
  use: "useMedkit",
  heal: 80,
};

const AMMO_PACKS: readonly { pool: AmmoPool; label: string; small: number; large: number }[] = [
  { pool: "light", label: "Light Rounds", small: 30, large: 90 },
  { pool: "heavy", label: "Heavy Rounds", small: 20, large: 60 },
  { pool: "shell", label: "Shells", small: 6, large: 18 },
  { pool: "energy", label: "Energy Cells", small: 25, large: 75 },
];

export const ammoPacks: readonly GearItemDef[] = AMMO_PACKS.flatMap((pack) => [
  {
    id: `ammo_${pack.pool}_small`,
    name: pack.label,
    kind: "ammo" as const,
    ammo: pack.pool,
    ammoAmount: pack.small,
  },
  {
    id: `ammo_${pack.pool}_large`,
    name: `${pack.label} Crate`,
    kind: "ammo" as const,
    ammo: pack.pool,
    ammoAmount: pack.large,
  },
]);

export const gearItems: readonly GearItemDef[] = [frag_grenade, medkit_small, medkit_large, ...ammoPacks];

const gearByIdMap = new Map(gearItems.map((item) => [item.id, item]));

export function gearById(id: string): GearItemDef | undefined {
  return gearByIdMap.get(id);
}
