export type TierId = "calm" | "restless" | "feral";

export interface TierDef {
  id: TierId;
  label: string;
  periodMult: number;
  speedMult: number;
  tagline: string;
}

export const TIERS: Record<TierId, TierDef> = {
  calm: {
    id: "calm",
    label: "Calm Night",
    periodMult: 1.4,
    speedMult: 0.88,
    tagline: "Wide, forgiving windows. Good for learning the boulevards.",
  },
  restless: {
    id: "restless",
    label: "Restless Hour",
    periodMult: 1,
    speedMult: 1,
    tagline: "The city breathes at its normal pace.",
  },
  feral: {
    id: "feral",
    label: "Feral Rush",
    periodMult: 0.68,
    speedMult: 1.18,
    tagline: "Traffic barely pauses. Every window is earned.",
  },
};

export const TIER_ORDER: readonly TierId[] = ["calm", "restless", "feral"];

export function isTierId(value: string): value is TierId {
  return value === "calm" || value === "restless" || value === "feral";
}
