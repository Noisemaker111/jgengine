export type Stratum = "vault" | "cold" | "wells" | "choir";

export interface StratumDef {
  id: Stratum;
  numeral: string;
  name: string;
  /** Metres below Marrow, for the depth strip. */
  metres: number;
  pressure: number;
  above: Stratum | null;
  below: Stratum | null;
  lamp: { color: string; intensity: number; reach: number; flicker: number };
  fog: { color: string; near: number; far: number };
  ambient: number;
  arrival: string;
  /** What the cold or the ink does to the body here, as rate multipliers on the survival meters. */
  drain: { food: number; water: number; air: number };
}

export const STRATA: Record<Stratum, StratumDef> = {
  vault: {
    id: "vault", numeral: "I", name: "Receiving", metres: 40, pressure: 1, above: null, below: "cold",
    lamp: { color: "#a4ded2", intensity: 27, reach: 12, flicker: 0.12 }, fog: { color: "#0b171b", near: 12, far: 48 }, ambient: 0.72,
    arrival: "Bellwether / receiving. The rail behind you is the only way home.",
    drain: { food: 1, water: 1, air: 1 },
  },
  cold: {
    id: "cold", numeral: "II", name: "Cold Stores", metres: 120, pressure: 2, above: "vault", below: "wells",
    lamp: { color: "#bcd8ff", intensity: 13, reach: 11, flicker: 0.2 }, fog: { color: "#0b1620", near: 9, far: 40 }, ambient: 0.42,
    arrival: "Cold stores. The heaters died with the shift; the cold eats food twice as fast down here.",
    drain: { food: 2, water: 1, air: 1.15 },
  },
  wells: {
    id: "wells", numeral: "III", name: "Ink Wells", metres: 260, pressure: 3, above: "cold", below: "choir",
    lamp: { color: "#c9b8e6", intensity: 6, reach: 9, flicker: 0.35 }, fog: { color: "#0c090f", near: 4, far: 24 }, ambient: 0.16,
    arrival: "Ink wells. Lamps are few. Couriers hunt by sound and by blood; walk, and keep the lamp low.",
    drain: { food: 1.2, water: 1.6, air: 1.3 },
  },
  choir: {
    id: "choir", numeral: "IV", name: "Choir Deep", metres: 400, pressure: 4, above: "wells", below: null,
    lamp: { color: "#ff6a52", intensity: 3, reach: 8, flicker: 0.45 }, fog: { color: "#070203", near: 3, far: 18 }, ambient: 0.1,
    arrival: "Choir deep. Something enormous is breathing. It comes to light. Douse the lamp and move.",
    drain: { food: 1.2, water: 1.4, air: 1.5 },
  },
};

export const STRATUM_ORDER: readonly Stratum[] = ["vault", "cold", "wells", "choir"];

export function isStratum(value: unknown): value is Stratum {
  return typeof value === "string" && Object.hasOwn(STRATA, value);
}

export const SEAL_RATING = { 1: 2, 2: 3, 3: 4 } as const;
/** Suit damage per second for each pressure step past the seal's rating. */
export const CRUSH_PER_STEP = 7;

/** Hull damage a second for standing in `stratum` with a seal of `mark`; zero inside the rating. */
export function crushDamage(stratum: Stratum, mark: 1 | 2 | 3): number {
  const over = STRATA[stratum].pressure - SEAL_RATING[mark];
  return over > 0 ? over * CRUSH_PER_STEP : 0;
}
