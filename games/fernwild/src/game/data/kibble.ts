import type { Curve } from "@jgengine/core/progression/leveling";
import type { RecipeDef } from "@jgengine/core/crafting/recipe";
import type { FeedingFood } from "../../engine-local/subdual/subdualFeeding";

/**
 * ARK's kibble (ark.wiki.gg/wiki/Kibble, since the Homestead update): six tiers, each cooked in a cooking
 * pot from an egg of its size. A creature tames about 5x faster on its preferred tier (or any higher one)
 * than on raw meat or berries, with the best effectiveness; a lower tier is worse than plain food (0.66x).
 * Fernwild has no crops yet, so each recipe's crop inputs are stood in for by berries, meat and fiber
 * (approximate); the egg sizes and the preferred tiers follow the wiki.
 */

export const KIBBLE_TIERS = ["basic", "simple", "regular", "superior", "exceptional"] as const;
export type KibbleTier = (typeof KIBBLE_TIERS)[number];

/** Egg sizes, smallest first; each tier's kibble needs one egg of the matching size. */
export const EGG_SIZES = ["xs", "s", "m", "l", "xl"] as const;
export type EggSize = (typeof EGG_SIZES)[number];

export const EGG_LABEL: Readonly<Record<EggSize, string>> = { xs: "Extra Small Egg", s: "Small Egg", m: "Medium Egg", l: "Large Egg", xl: "Extra Large Egg" };
export const KIBBLE_LABEL: Readonly<Record<KibbleTier, string>> = { basic: "Basic Kibble", simple: "Simple Kibble", regular: "Regular Kibble", superior: "Superior Kibble", exceptional: "Exceptional Kibble" };

export const eggItem = (size: EggSize): string => `egg_${size}`;
export const kibbleItem = (tier: KibbleTier): string => `kibble_${tier}`;

/** The wiki's preferred-tier examples; every other species is placed by its torpor (how big a body it is). */
const PREFERRED: Readonly<Record<string, KibbleTier>> = {
  dodo: "basic", dilophosaur: "basic", parasaur: "basic", phiomia: "basic",
  raptor: "simple", triceratops: "simple", pachy: "simple", iguanodon: "simple",
  ankylosaurus: "regular", carnotaurus: "regular", pteranodon: "regular", stegosaurus: "regular", sabertooth: "regular",
  argentavis: "superior", direwolf: "superior", mammoth: "superior", allosaurus: "superior",
  rex: "exceptional", yutyrannus: "exceptional", thylacoleo: "exceptional", megalania: "exceptional",
};

/** The tier a species tames best on (and every tier above it). */
export function preferredKibble(species: string, torpor: number): KibbleTier {
  const named = PREFERRED[species];
  if (named !== undefined) return named;
  if (torpor < 150) return "basic";
  if (torpor < 300) return "simple";
  if (torpor < 700) return "regular";
  if (torpor < 1500) return "superior";
  return "exceptional";
}

/** The egg a species lays, by body size (radius in metres). */
export function eggSizeFor(radius: number): EggSize {
  if (radius < 0.6) return "xs";
  if (radius < 0.9) return "s";
  if (radius < 1.4) return "m";
  if (radius < 2.2) return "l";
  return "xl";
}

const scale = (curve: Curve, by: number): Curve =>
  curve.kind === "piecewise" ? { ...curve, points: curve.points.map(([level, value]) => [level, Math.max(1, Math.round(value * by))] as [number, number]) } : curve;

/**
 * A species' foods with kibble added in ARK's order: its preferred tier first, then the tiers above it,
 * then its own foods, then the tiers below (which it eats only when nothing better is carried).
 * `baseline` is the plain food the speeds are measured against (raw meat or mejoberries).
 */
export function withKibble(foods: Readonly<Record<string, FeedingFood>>, baseline: string, preferred: KibbleTier): Record<string, FeedingFood> {
  const base = foods[baseline] ?? Object.values(foods)[0];
  if (base === undefined) return { ...foods };
  // 80 food a kibble against 50 a raw meat: fewer bites; 5x the affinity per food point: a fifth of the time.
  const good: FeedingFood = { meals: scale(base.meals, 0.25), seconds: scale(base.seconds, 0.2), cost: 0.01 };
  const poor: FeedingFood = { meals: scale(base.meals, 1.3), seconds: scale(base.seconds, 1.5), cost: 0.05 };
  const at = KIBBLE_TIERS.indexOf(preferred);
  const above = KIBBLE_TIERS.slice(at).map((tier) => [kibbleItem(tier), good] as const);
  const below = KIBBLE_TIERS.slice(0, at).reverse().map((tier) => [kibbleItem(tier), poor] as const);
  return { ...Object.fromEntries(above), ...foods, ...Object.fromEntries(below) };
}

/** Cooking-pot recipes, one per tier. The egg is ARK's; the rest stands in for crops Fernwild does not grow yet (approx). */
const RECIPE_INPUTS: Readonly<Record<KibbleTier, Record<string, number>>> = {
  basic: { mejoberry: 5, amarberry: 10, tintoberry: 10, cooked_meat: 1, fiber: 5 },
  simple: { mejoberry: 5, cooked_meat: 1, fiber: 10 },
  regular: { azulberry: 10, cooked_meat: 2, fiber: 10 },
  superior: { cooked_meat: 3, raw_prime_meat: 1, fiber: 15 },
  exceptional: { mejoberry: 10, raw_prime_meat: 2, fiber: 20 },
};

/** 30 seconds a kibble in a lit pot, as ARK. Kibble needs no engram: the cooking pot knows every recipe. */
export const KIBBLE_RECIPES: readonly RecipeDef[] = KIBBLE_TIERS.map((tier, index) => ({
  id: `cook_${kibbleItem(tier)}`,
  inputs: [{ itemId: eggItem(EGG_SIZES[index]!), count: 1 }, ...Object.entries(RECIPE_INPUTS[tier]).map(([itemId, count]) => ({ itemId, count }))],
  outputs: [{ itemId: kibbleItem(tier), count: 1 }],
  seconds: 30,
  station: "cooking_pot",
  stationRange: 4,
  category: "cooking_pot",
}));

/** A wild female egg-layer drops an unfertilized egg about this often (game seconds; ARK's wild laying is random, approx). */
export const EGG_LAY_SECONDS = 600;
/** Eggs lying near one creature before it stops laying more. */
export const EGGS_NEARBY_CAP = 2;
