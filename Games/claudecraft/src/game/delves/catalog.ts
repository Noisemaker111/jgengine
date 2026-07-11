export type DelveTier = "normal" | "heroic";

export interface DelveChamberTemplate {
  id: string;
  name: string;
  mobPool: readonly string[];
  count: number;
  boss?: boolean;
}

export interface DelveDef {
  id: string;
  name: string;
  zone: "vale" | "marsh" | "peaks";
  entrance: readonly [number, number];
  center: readonly [number, number];
  radius: number;
  baseLevel: number;
  chambers: readonly DelveChamberTemplate[];
  companionName: string;
}

export const DELVES: readonly DelveDef[] = [
  {
    id: "embervein_delve",
    name: "Embervein Hollow",
    zone: "vale",
    entrance: [42, -278],
    center: [58, -250],
    radius: 20,
    baseLevel: 5,
    companionName: "Scout Brannic",
    chambers: [
      { id: "entry", name: "Ashen Threshold", mobPool: ["forest_wolf", "wild_boar"], count: 3 },
      { id: "veins", name: "Smolder Veins", mobPool: ["vale_bandit", "webwood_spider"], count: 4 },
      { id: "heart", name: "Cinder Heart", mobPool: ["vale_bandit"], count: 2, boss: true },
    ],
  },
  {
    id: "mirecoil_delve",
    name: "Mirecoil Grotto",
    zone: "marsh",
    entrance: [36, 28],
    center: [52, 54],
    radius: 18,
    baseLevel: 11,
    companionName: "Warden Silt",
    chambers: [
      { id: "brack", name: "Brackish Mouth", mobPool: ["mire_prowler", "mudfin_murloc"], count: 3 },
      { id: "coil", name: "Coil Galleries", mobPool: ["mire_prowler", "deepfen_murloc"], count: 4 },
      { id: "coilheart", name: "Coilheart", mobPool: ["deepfen_murloc"], count: 2, boss: true },
    ],
  },
];

export function delveById(id: string): DelveDef | null {
  for (const delve of DELVES) {
    if (delve.id === id) return delve;
  }
  return null;
}

export function levelForTier(baseLevel: number, tier: DelveTier, chamberIndex: number): number {
  const tierBonus = tier === "heroic" ? 3 : 0;
  return Math.min(20, baseLevel + tierBonus + chamberIndex);
}
