import { creepDef } from "../entities/enemies/catalog";

/**
 * Scrap pay: a unit's authored bounty is its weight in cash, and the wave multiplies it. Wave 1 pays
 * the authored weight exactly; every later wave pays a quarter more, so a wave-8 pair of earbuds is
 * worth more than a wave-1 phone. `maxScale` keeps a deep run from printing cash.
 */
export const BOUNTY_RULE = {
  perWave: 0.25,
  maxScale: 4,
} as const;

/** The wave's multiplier on every unit's weight, times any perk the player carries. */
export function bountyScale(wave: number, relicScale = 1): number {
  const waveScale = Math.min(BOUNTY_RULE.maxScale, 1 + BOUNTY_RULE.perWave * Math.max(0, wave - 1));
  return waveScale * relicScale;
}

/** What one kill of `unit` pays on `wave`: its weight, the wave's multiplier, and the relic's. */
export function killBounty(unit: string, wave: number, relicScale = 1): number {
  return Math.round(creepDef(unit).bounty * bountyScale(wave, relicScale));
}

export interface BountyReadout {
  /** The multiplier a kill pays at the run's deepest wave. */
  scale: number;
  /** What the lightest tech (a pair of earbuds) pays on wave 1. */
  opening: number;
  /** What the same tech pays on the deepest wave reached. */
  closing: number;
  /** Every bounty paid this run. */
  earned: number;
}

/** The end-of-day readout: the same tech's pay at the start and at the run's last wave. */
export function bountyReadout(deepestWave: number, earned: number, relicScale = 1): BountyReadout {
  return {
    scale: bountyScale(deepestWave, relicScale),
    opening: killBounty("tech_earbuds", 1, relicScale),
    closing: killBounty("tech_earbuds", Math.max(1, deepestWave), relicScale),
    earned,
  };
}
