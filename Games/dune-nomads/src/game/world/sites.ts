export interface WorldSite {
  id: string;
  name: string;
  proverb: string;
  x: number;
  z: number;
}

export interface OasisSite extends WorldSite {
  tentCount: number;
  waterRadius: number;
}

export interface RuinSite extends WorldSite {
  pillarCount: number;
}

export const WORLD_BOUNDS = { w: 2500, d: 2500 };

export const SOUTH_GATE: WorldSite = {
  id: "south-gate",
  name: "Qadir's Gate",
  proverb: "The wind writes the road anew.",
  x: 0,
  z: 1050,
};

export const CITY: WorldSite = {
  id: "city",
  name: "Meridaan, the Far City",
  proverb: "Every dune remembers a caravan that did not.",
  x: 60,
  z: -1080,
};

export const OASES: readonly OasisSite[] = [
  { id: "bitter-well", name: "Bitter Well", proverb: "Water is the only true coin.", x: -260, z: 700, tentCount: 3, waterRadius: 10 },
  { id: "palm-hollow", name: "Palm Hollow", proverb: "Shade is a gift, not a right.", x: 320, z: 380, tentCount: 5, waterRadius: 14 },
  { id: "ashen-springs", name: "Ashen Springs", proverb: "The lee face forgives; the windward face teaches.", x: -180, z: 40, tentCount: 4, waterRadius: 12 },
  { id: "widows-cistern", name: "Widow's Cistern", proverb: "A full skin is a short memory.", x: 260, z: -320, tentCount: 6, waterRadius: 16 },
  { id: "last-water", name: "Last Water", proverb: "Drink here, or drink dust the rest of the way.", x: -140, z: -700, tentCount: 4, waterRadius: 11 },
];

export const RUINS: readonly RuinSite[] = [
  { id: "sunken-colonnade", name: "The Sunken Colonnade", proverb: "Stone remembers; sand forgets.", x: 40, z: 520, pillarCount: 5 },
  { id: "bone-gate", name: "Bone Gate", proverb: "What the storm buries, the wind exhumes.", x: -420, z: 180, pillarCount: 3 },
  { id: "leaning-minaret", name: "The Leaning Minaret", proverb: "It has fallen for a thousand years and never lands.", x: 420, z: -60, pillarCount: 4 },
  { id: "salt-ossuary", name: "Salt Ossuary", proverb: "The dead here paid the water price and lost.", x: 60, z: -520, pillarCount: 6 },
];

export const ALL_SITES: readonly WorldSite[] = [SOUTH_GATE, CITY, ...OASES, ...RUINS];

export function oasisNameById(id: string): string {
  return OASES.find((oasis) => oasis.id === id)?.name ?? "the oasis";
}
