import type { AmmoPool } from "../../ammo";

export interface GearDef {
  id: string;
  name: string;
  kind: "ammo" | "health" | "shield_mod";
  use?: string;
  ammo?: AmmoPool;
  ammoAmount?: number;
  heal?: number;
  shieldBonus?: number;
  trade?: { buy: Record<string, number>; shops: string[] };
}

export const SHOP_ID = "shop_ferralon";

export const gearItems: readonly GearDef[] = [
  // A pack holds about what a camp kill costs (enemies carry ENEMY_TOUGHNESS times their listed
  // health), so a player who hits most shots and picks up drops keeps fighting.
  { id: "ammo_pistol_pack", name: "Box of Staples", kind: "ammo", ammo: "pistol", ammoAmount: 72 },
  { id: "ammo_smg_pack", name: "Coffee Can of Nails", kind: "ammo", ammo: "smg", ammoAmount: 108 },
  { id: "ammo_shotgun_pack", name: "Bag of Gravel & Change", kind: "ammo", ammo: "shotgun", ammoAmount: 24 },
  { id: "ammo_rifle_pack", name: "Water Jug", kind: "ammo", ammo: "rifle", ammoAmount: 84 },
  { id: "ammo_sniper_pack", name: "Popcorn Kernels", kind: "ammo", ammo: "sniper", ammoAmount: 18 },
  { id: "ammo_rocket_pack", name: "Loaf of Bread", kind: "ammo", ammo: "rocket", ammoAmount: 5 },
  { id: "insta_health", name: "Juice Box", kind: "health", use: "useHealthVial", heal: 35, trade: { buy: { cash: 45 }, shops: ["shop_ferralon"] } },
  { id: "insta_health_big", name: "Casserole", kind: "health", use: "useHealthVial", heal: 80, trade: { buy: { cash: 110 }, shops: ["shop_ferralon"] } },
  { id: "shield_upgrade", name: "Oven-Mitt Force Field", kind: "shield_mod", use: "useShieldBooster", shieldBonus: 25, trade: { buy: { cash: 220 }, shops: ["shop_ferralon"] } },
];

const byId = new Map(gearItems.map((item) => [item.id, item]));

export function gearById(id: string): GearDef | undefined {
  return byId.get(id);
}

export const AMMO_PRICES: Record<AmmoPool, { cash: number; amount: number }> = {
  pistol: { cash: 18, amount: 48 },
  smg: { cash: 22, amount: 72 },
  shotgun: { cash: 24, amount: 16 },
  rifle: { cash: 26, amount: 56 },
  sniper: { cash: 30, amount: 12 },
  rocket: { cash: 60, amount: 4 },
};
