export interface WeaponItemDef {
  id: string;
  name: string;
  kind: string;
  rarity: string;
  use?: string;
  weapon?: Record<string, number>;
}

export const pulse_rifle: WeaponItemDef = {
  id: "pulse_rifle",
  name: "Pulse Rifle",
  kind: "weapon",
  rarity: "common",
  use: "fireGun",
  weapon: { damage: 24, range: 60 },
};

export const shock_carbine: WeaponItemDef = {
  id: "shock_carbine",
  name: "Shock Carbine",
  kind: "weapon",
  rarity: "rare",
  use: "fireGun",
  weapon: { damage: 34, range: 55 },
};

export const stormcaller: WeaponItemDef = {
  id: "stormcaller",
  name: "The Stormcaller",
  kind: "weapon",
  rarity: "legendary",
  use: "fireGun",
  weapon: { damage: 58, range: 70 },
};

export const ammo_cell: WeaponItemDef = {
  id: "ammo_cell",
  name: "Ammo Cell",
  kind: "resource",
  rarity: "common",
};

export const weaponItems: WeaponItemDef[] = [pulse_rifle, shock_carbine, stormcaller, ammo_cell];
