import type { AmmoPool } from "../items/weapons/catalog";

export interface StationDef {
  id: string;
  name: string;
  accent: string;
  position: readonly [number, number];
}

export const stations: readonly StationDef[] = [
  { id: "station_ammo", name: "Ammo Requisition", accent: "#f5a623", position: [12, 0] },
  { id: "station_gear", name: "Gear Requisition", accent: "#38e1ff", position: [-12, 0] },
];

export const SHOP_ID = "requisition";

export const AMMO_PRICES: Record<AmmoPool, { amount: number; scrap: number }> = {
  light: { amount: 90, scrap: 25 },
  heavy: { amount: 60, scrap: 35 },
  shell: { amount: 18, scrap: 30 },
  energy: { amount: 75, scrap: 35 },
};

export const GEAR_STOCK: readonly string[] = ["frag_grenade", "medkit_small", "medkit_large"];

export const MYSTERY_CRATE = { scrap: 150, table: "mystery_crate" };

export function stationById(id: string): StationDef | undefined {
  return stations.find((station) => station.id === id);
}
