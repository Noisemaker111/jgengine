import { stepRandomSeed, type RandomSeed } from "../../random/rng";
import type { PlantSpecies } from "../species/plantSpecies";
import { plantCos, plantExp, plantLog, PLANT_PI } from "./plantMath";

/**
 * How far one individual's architecture strays from its species record, as standard deviations.
 * Trees of one species and size differ in crown width by about a quarter either way (Jucker et al.
 * 2022, Tallo); these spreads are set so the seeds of one species span that band
 * (plants/growth/individualVariation.test.ts).
 */
const INDIVIDUAL_SPREAD = {
  /** Degrees added to the branch angle and to the lateral set point. */
  angleDeg: 15,
  /**
   * Log-scale spread of what mature apical control lets through to laterals, 1 - apical control. A
   * seedling's leader is strong in every tree (Brown, McAlpine & Kormanik 1967), so individuals differ
   * only in how much of it they lose with age; a weaker seedling leader would fork at the ground.
   */
  apicalLeak: 0.3,
  /** Log-scale spread of the vigour sent to horizontal shoots. */
  horizontalVigour: 0.35,
  /** Log-scale spread of gravitropic pull. */
  gravity: 0.4,
  /** Log-scale spread of internode length. */
  internode: 0.15,
} as const;

/**
 * The growth parameters of the individual a seed grows: the species record with each varying trait
 * drawn around it, the same for the same seed.
 * @internal
 */
export function individualGrowth(growth: PlantSpecies["growth"], seed: RandomSeed): PlantSpecies["growth"] {
  let cursor = seed;
  const normal = (): number => {
    const [u, a] = stepRandomSeed(cursor);
    const [v, b] = stepRandomSeed(a);
    cursor = b;
    // Bounded at two deviations: a seed grows an unusual tree of its species, never a freak.
    return Math.max(-2, Math.min(2, Math.sqrt(-2 * plantLog(Math.max(1e-12, u))) * plantCos(2 * PLANT_PI * v)));
  };
  const spread = INDIVIDUAL_SPREAD;
  const leak = plantExp(spread.apicalLeak * normal());
  const angle = spread.angleDeg * normal();
  return {
    ...growth,
    apicalControlMature: 1 - (1 - growth.apicalControlMature) * leak,
    branchAngle: Math.max(5, Math.min(110, growth.branchAngle + angle)),
    horizontalVigour: growth.horizontalVigour * plantExp(spread.horizontalVigour * normal()),
    internodeMax: growth.internodeMax * plantExp(spread.internode * normal()),
    tropism: {
      ...growth.tropism,
      gravity: growth.tropism.gravity * plantExp(spread.gravity * normal()),
      setpointAngle: Math.max(0, Math.min(growth.tropism.setpointMax, growth.tropism.setpointAngle + angle)),
    },
  };
}
