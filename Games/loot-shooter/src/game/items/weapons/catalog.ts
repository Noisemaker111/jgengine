export interface WeaponItemDef {
  id: string;
  name: string;
  kind: string;
  use?: string;
  weapon?: Record<string, number>;
}

export const pulse_rifle: WeaponItemDef = {
  id: "pulse_rifle",
  name: "Pulse Rifle",
  kind: "weapon",
  use: "fireGun",
  weapon: { damage: 24, range: 60 },
};

export const ammo_cell: WeaponItemDef = {
  id: "ammo_cell",
  name: "Ammo Cell",
  kind: "resource",
};

export const weaponItems: WeaponItemDef[] = [pulse_rifle, ammo_cell];
