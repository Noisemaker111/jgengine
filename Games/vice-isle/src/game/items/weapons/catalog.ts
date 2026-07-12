export type AmmoKind = "9mm" | "shell" | "none";

export interface WeaponDef {
  id: string;
  label: string;
  kind: "weapon";
  use: string;
  ammo: AmmoKind;
  ammoPerShot: number;
  fireIntervalMs: number;
  requires?: readonly string[];
  weapon: {
    damage: number;
    projectile?: { mass: number; gravity: number; fuseTime: number };
    explosion?: { radius: number };
  };
  trade?: { buy?: Record<string, number>; shops?: string[] };
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: "pistol_vice",
    label: "Vice 9",
    kind: "weapon",
    use: "fireGun",
    ammo: "9mm",
    ammoPerShot: 1,
    fireIntervalMs: 280,
    weapon: { damage: 14 },
  },
  {
    id: "smg_carmine",
    label: "Carmine SMG",
    kind: "weapon",
    use: "fireGun",
    ammo: "9mm",
    ammoPerShot: 1,
    fireIntervalMs: 95,
    weapon: { damage: 9 },
    trade: { buy: { cash: 1200 }, shops: ["shop_ammunation"] },
  },
  {
    id: "shotgun_boardwalk",
    label: "Boardwalk 12g",
    kind: "weapon",
    use: "fireGun",
    ammo: "shell",
    ammoPerShot: 1,
    fireIntervalMs: 850,
    weapon: { damage: 42 },
    trade: { buy: { cash: 2000 }, shops: ["shop_ammunation"] },
  },
  {
    id: "grenade_pineapple",
    label: "Pineapple",
    kind: "weapon",
    use: "throwGrenade",
    ammo: "none",
    ammoPerShot: 0,
    fireIntervalMs: 900,
    weapon: { damage: 80, projectile: { mass: 1, gravity: -18, fuseTime: 1.4 }, explosion: { radius: 6 } },
    trade: { buy: { cash: 150 }, shops: ["shop_ammunation"] },
  },
];

export const AMMO_STAT_IDS: Record<Exclude<AmmoKind, "none">, string> = {
  "9mm": "ammo_9mm",
  shell: "ammo_shell",
};

export interface GearDef {
  id: string;
  label: string;
  kind: "gear";
  use?: string;
  heal?: number;
  armor?: number;
  ammoGrant?: { stat: string; amount: number };
  stack: number;
  trade?: { buy?: Record<string, number>; sell?: Record<string, number>; shops?: string[] };
}

export const GEAR: readonly GearDef[] = [
  { id: "medkit_street", label: "Street Medkit", kind: "gear", use: "useMedkit", heal: 45, stack: 5, trade: { buy: { cash: 120 }, shops: ["shop_ammunation"] } },
  { id: "vest_kevlar", label: "Kevlar Vest", kind: "gear", use: "wearVest", armor: 100, stack: 2, trade: { buy: { cash: 400 }, shops: ["shop_ammunation"] } },
  { id: "ammo_box_9mm", label: "9mm Box", kind: "gear", use: "loadAmmo", ammoGrant: { stat: "ammo_9mm", amount: 48 }, stack: 10, trade: { buy: { cash: 60 }, shops: ["shop_ammunation"] } },
  { id: "ammo_box_shell", label: "Shell Box", kind: "gear", use: "loadAmmo", ammoGrant: { stat: "ammo_shell", amount: 12 }, stack: 10, trade: { buy: { cash: 90 }, shops: ["shop_ammunation"] } },
  { id: "briefcase_carmine", label: "Carmine Ledger", kind: "gear", stack: 1, trade: { sell: { cash: 0 } } },
];

export const weaponById = (id: string): WeaponDef | undefined => WEAPONS.find((w) => w.id === id);
export const gearById = (id: string): GearDef | undefined => GEAR.find((g) => g.id === id);
