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
  { id: "ammo_pistol_pack", name: "Pistol Rounds", kind: "ammo", ammo: "pistol", ammoAmount: 24 },
  { id: "ammo_smg_pack", name: "SMG Rounds", kind: "ammo", ammo: "smg", ammoAmount: 36 },
  { id: "ammo_shotgun_pack", name: "Shotgun Shells", kind: "ammo", ammo: "shotgun", ammoAmount: 8 },
  { id: "ammo_rifle_pack", name: "Rifle Rounds", kind: "ammo", ammo: "rifle", ammoAmount: 28 },
  { id: "ammo_sniper_pack", name: "Sniper Rounds", kind: "ammo", ammo: "sniper", ammoAmount: 6 },
  { id: "ammo_rocket_pack", name: "Rockets", kind: "ammo", ammo: "rocket", ammoAmount: 2 },
  { id: "insta_health", name: "Insta-Health Vial", kind: "health", use: "useHealthVial", heal: 35, trade: { buy: { cash: 45 }, shops: ["shop_ferralon"] } },
  { id: "insta_health_big", name: "Big Insta-Health", kind: "health", use: "useHealthVial", heal: 80, trade: { buy: { cash: 110 }, shops: ["shop_ferralon"] } },
  { id: "shield_upgrade", name: "Capacitive Shield Booster", kind: "shield_mod", use: "useShieldBooster", shieldBonus: 25, trade: { buy: { cash: 220 }, shops: ["shop_ferralon"] } },
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
