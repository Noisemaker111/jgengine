// @skill jgengine-world
import type { PlantSourceId } from "./speciesSources";

/** Hallé–Oldeman architectural model of a genus (Hallé, Oldeman & Tomlinson 1978). */
export type HalleOldemanModel = "rauh" | "troll" | "corner" | "leeuwenberg" | "attims" | "massart" | "scarrone" | "roux" | "tomlinson";

/** Bark surface kind a style reads to pick its bark material. */
export type BarkKind = "smooth" | "furrowed" | "plated" | "peeling" | "fibrous" | "scaly";

/**
 * A leaf outline as numbers, so a style can draw it at any detail. A frond (pinnate palm or fern leaf)
 * or fan (palmate palm leaf) is one large leaf per metamer drawn as an arched blade: `lobes` is its
 * pinna pairs or fan segments, `lobeDepth` how deep they split, and for a frond `aspect` is the
 * blade's width over its length.
 */
export interface LeafShapeParams {
  /** Main outline: lobed (maple, oak), ovate (beech), needle, scale, blade, frond, fan. */
  kind: "lobed" | "ovate" | "lanceolate" | "needle" | "scale" | "blade" | "frond" | "fan";
  lobes: number;
  /** Depth of the sinus between lobes, 0 none .. 1 to the midrib. */
  lobeDepth: number;
  /** Width over length. */
  aspect: number;
  petioleFraction: number;
}

/** Leaf colours across the season as hex strings. */
export interface SeasonalColor {
  spring: string;
  summer: string;
  autumn: string;
}

/**
 * One species' biology as plain data: architecture, carbon economy, wood, leaves and limits. Every
 * value is a measured trait or a fitted parameter, never a look; styles live elsewhere.
 */
export interface PlantSpecies {
  id: string;
  /** Bumped when any value changes; part of every structure cache key. */
  version: number;
  names: { scientific: string; common: Readonly<Record<string, string>> };
  ids: { gbif?: number; usda?: string; wikidata?: string };
  habit: "tree" | "shrub" | "palm" | "fern" | "graminoid" | "forb" | "moss";
  architecture: {
    model: HalleOldemanModel;
    phyllotaxis: "alternate" | "opposite" | "whorled" | "spiral";
    /** Rotation between successive nodes, degrees (90 for decussate opposite leaves). */
    divergence: number;
  };
  growth: {
    /** Borchert–Honda apical control λ in 0..1 of a young plant: the main axis's weight against its laterals. */
    apicalControl: number;
    /**
     * λ the plant settles to with age. Decurrent trees (maples, oaks) lose much of their apical control
     * as they mature and laterals overtake the leader into a rounded crown; excurrent trees (pines,
     * firs) keep most of it and stay conical (Brown, McAlpine & Kormanik 1967; Wilson 2000).
     */
    apicalControlMature: number;
    /** Age in years at which λ has moved halfway from {@link apicalControl} to {@link apicalControlMature}. */
    apicalControlHalfYears: number;
    /** Internode length, metres. */
    internodeMax: number;
    /** Branching angle between a lateral shoot and its parent axis, degrees. */
    branchAngle: number;
    lateralBudsPerNode: number;
    /** Most internodes one bud makes in a year. */
    maxMetamersPerShoot: number;
    /**
     * Years of the establishment phase: a seedling's growth units start small and reach full size over
     * this many years as its root system builds (Barthélémy & Caraglio 2007). 0 for none.
     */
    establishmentYears: number;
    /**
     * Stems the seedling sets at its base: 1 for a single trunk, more for a multi-stemmed tree that
     * forks at the root collar (Barthélémy & Caraglio 2007, basitony). DBH is then the quadratic sum
     * of the stems at breast height, as forest inventories measure it.
     */
    basalStems: number;
    /**
     * A shrub's stems live this many years on average (each one 0.6–1.4 of it), then die and a new
     * sucker rises from the root collar, so the clump renews itself and never grows a trunk (Bond &
     * Midgley 2001; Wilson & Tilman 1991 on clonal stem turnover). Absent for a tree, whose stems
     * live as long as it does.
     */
    stemLifespanYears?: number;
    /**
     * Years a palm or fern takes to reach full frond size: its first fronds are a tenth as long and
     * lengthen as the stem widens through its establishment phase (Tomlinson 1990). Absent for
     * leaves that are full size from the start.
     */
    frondEstablishmentYears?: number;
    /**
     * Gravimorphism (Wareing & Nasr 1961): share of that maximum a horizontal shoot keeps; upright
     * shoots keep all of it, in between scales with the shoot's vertical component.
     */
    horizontalVigour: number;
    /**
     * LIGNUM vigour index weight w (Nikinmaa et al. 2003): a shoot may reach (1 − w + w·VI) of its
     * maximum, where VI is 1 on the trunk and shrinks at every join by the branch's cross-section over
     * the thickest child's.
     */
    vigourIndexWeight: number;
    tropism: {
      /** Gravitropic pull per metamer towards the axis's set-point angle. */
      gravity: number;
      /** Factor applied to the gravity pull per branch order. */
      gravityOrderDecay: number;
      /**
       * Gravitropic set-point angle of first-order laterals, degrees from vertical (Digby & Firn 1995):
       * laterals bend towards this angle instead of straight up. The trunk's set point is 0.
       */
      setpointAngle: number;
      /** Degrees added to the set point per further branch order, up to `setpointMax`. */
      setpointPerOrder: number;
      /**
       * Largest set point of any order, degrees from vertical: 90 keeps the finest shoots level, more
       * lets them hang below the horizontal as a weeping crown's do.
       */
      setpointMax: number;
      /** Pull towards the least-shaded neighbouring voxel (Palubicki's optimal growth direction). */
      optimal: number;
      /** Pull along the prevailing wind, per unit wind strength. */
      wind: number;
    };
    /** Relative light under which a bud does not flush. */
    budLightThreshold: number;
    /** Years a terminal bud survives without flushing. */
    budDeathYears: number;
    /** Years a lateral bud stays able to break before it dies. */
    dormantBudYears: number;
    /** Years a node keeps bearing leaves on short shoots. */
    spurYears: number;
    /** Light-field coupling: a·b^-q per voxel layer q, propagated at most `depth` layers. */
    shadow: { a: number; b: number; depth: number };
    /** Light extinction coefficient k of Beer–Lambert, per unit leaf area index. */
    extinction: number;
    /** Relative bud-direction jitter, radians. */
    jitter: number;
  };
  carbon: {
    /** Gross light-use efficiency of a leaf in open sky, grams of dry matter per MJ of absorbed PAR. */
    lueGPerMJ: number;
    /**
     * Light (0..1 of open sky) at which a leaf's photosynthesis is half its light-saturated rate. Leaf
     * photosynthesis saturates with light (a rectangular hyperbola, Thornley 1976), so shade leaves use
     * each photon better than sun leaves; shade-tolerant species saturate at lower light.
     */
    lightHalfSaturation: number;
    /** Foliage maintenance respiration, kg per kg per year. */
    respiration: number;
    sapwoodRespiration: number;
    rootRespiration: number;
    /** Fine-root mass per foliage mass. */
    rootPerFoliage: number;
    rootTurnover: number;
    /**
     * Share of a node's foliage regrown each year once its leaves outlive `leaf.lifespanYears` (1 for a
     * deciduous tree re-leafing its spurs). Leaves still within their lifespan were paid for with the
     * shoot that bore them.
     */
    foliageTurnover: number;
    /** Construction efficiency: kg of tissue per kg of assimilate. */
    growthEfficiency: number;
    /** Pipe model: sapwood area per leaf area above (m² per m²). */
    sapwoodPerFoliage: number;
    /** Share of sapwood that turns into heartwood each year. */
    sapwoodTurnover: number;
    /** da Vinci exponent n in r^n = Σ r_i^n at a branch join. */
    pipeExponent: number;
    /** Share of the growth budget spent on flowers and seed once mature. */
    reproductiveShare: number;
    /** Years a branch may run a carbon deficit before it is shed. */
    pruneDeficitYears: number;
    /** Coarse-root wood built per unit of above-ground wood. */
    coarseRootShare: number;
    /**
     * Hydraulic limitation (Ryan & Yoder 1997): photosynthesis at height h is scaled by
     * 1 − (h / H)^p, H being `hydraulicHeightShare` of limits.maxHeightM. A whole number p.
     */
    hydraulicExponent: number;
    /**
     * Share of limits.maxHeightM where the reference site stops height growth: the record height
     * comes from the best sites, and a typical one tops out lower (Koch et al. 2004). 1 uses the record.
     */
    hydraulicHeightShare: number;
  };
  wood: {
    /** Basic density, dry kg per green m³. */
    densityKgM3: number;
    /** Green mass over dry mass (water load on limbs). */
    greenFactor: number;
    /** Green modulus of elasticity, GPa. */
    modulusGPa: number;
    /** Share of each year's bending that reaction wood straightens back (gravimorphism). */
    reactionCompensation: number;
    /** Radius of a fresh shoot, metres. */
    shootRadiusM: number;
  };
  limits: {
    maxAgeYears: number;
    maxHeightM: number;
    maxDbhCm: number;
    maxCrownRadiusM: number;
  };
  /** Tolerances, 0..1. */
  tolerance: { shade: number; drought: number; frost: number; waterlogging: number };
  leaf: {
    shape: LeafShapeParams;
    /** Leaf length, cm; a scale-leaved species gives its flattened spray segment, the unit it grows foliage in. */
    sizeCm: number;
    /** Specific leaf area, m² per kg dry mass. */
    sla: number;
    lifespanYears: number;
    leavesPerNode: number;
    color: SeasonalColor;
  };
  bark: { kind: BarkKind; smoothUntilYears: number; furrowDepth: number; color: string };
  reproduction: { firstFlowerYears: number; flowerColor?: string; fruitColor?: string; seedMassMg: number };
  phenology: {
    /** Base temperature of spring forcing, °C. */
    forcingBaseC: number;
    /** Degree-days above the base that bring budburst. */
    forcingSum: number;
    chillingDays: number;
    /** Day length under which leaves senesce after midsummer, hours. */
    senescencePhotoperiodH: number;
  };
  /** Where each top-level field came from, for CREDITS.md and later refits. */
  provenance: Readonly<Record<string, { source: PlantSourceId; fitted?: { score: number; against: string } }>>;
}

const FIELD_RANGES: readonly (readonly [path: string, read: (s: PlantSpecies) => number, min: number, max: number])[] = [
  ["growth.apicalControl", (s) => s.growth.apicalControl, 0, 1],
  ["growth.apicalControlMature", (s) => s.growth.apicalControlMature, 0, 1],
  ["growth.apicalControlHalfYears", (s) => s.growth.apicalControlHalfYears, 0.1, 1000],
  ["growth.internodeMax", (s) => s.growth.internodeMax, 0.001, 2],
  ["growth.branchAngle", (s) => s.growth.branchAngle, 0, 180],
  ["growth.lateralBudsPerNode", (s) => s.growth.lateralBudsPerNode, 0, 8],
  ["growth.maxMetamersPerShoot", (s) => s.growth.maxMetamersPerShoot, 1, 64],
  ["growth.establishmentYears", (s) => s.growth.establishmentYears, 0, 100],
  ["growth.basalStems", (s) => s.growth.basalStems, 1, 8],
  ["growth.tropism.setpointMax", (s) => s.growth.tropism.setpointMax, 0, 170],
  ["growth.budLightThreshold", (s) => s.growth.budLightThreshold, 0, 1],
  ["growth.extinction", (s) => s.growth.extinction, 0.01, 2],
  ["growth.shadow.depth", (s) => s.growth.shadow.depth, 1, 512],
  ["carbon.lightHalfSaturation", (s) => s.carbon.lightHalfSaturation, 0.01, 10],
  ["carbon.growthEfficiency", (s) => s.carbon.growthEfficiency, 0.1, 1],
  ["carbon.sapwoodPerFoliage", (s) => s.carbon.sapwoodPerFoliage, 1e-6, 0.01],
  ["carbon.pipeExponent", (s) => s.carbon.pipeExponent, 1.5, 3],
  ["carbon.hydraulicHeightShare", (s) => s.carbon.hydraulicHeightShare, 0.3, 1],
  ["wood.densityKgM3", (s) => s.wood.densityKgM3, 100, 1400],
  ["leaf.sla", (s) => s.leaf.sla, 1, 100],
  ["limits.maxHeightM", (s) => s.limits.maxHeightM, 0.01, 130],
  ["limits.maxCrownRadiusM", (s) => s.limits.maxCrownRadiusM, 0.01, 60],
];

/**
 * Out-of-range or non-finite fields of a species record, as readable lines; empty when valid.
 * @capability plant-species register and validate plant species records: measured biology as plain data
 */
export function validatePlantSpecies(species: PlantSpecies): string[] {
  const problems: string[] = [];
  if (species.id.length === 0) problems.push("id is empty");
  for (const [path, read, min, max] of FIELD_RANGES) {
    const value = read(species);
    if (!Number.isFinite(value) || value < min || value > max) problems.push(`${path} = ${value}, expected ${min}..${max}`);
  }
  return problems;
}

const registry = new Map<string, PlantSpecies>();

/**
 * Register a species so tools and generators can look it up by id. Throws on an invalid record.
 * @capability plant-species register and validate plant species records: measured biology as plain data
 */
export function registerPlantSpecies(species: PlantSpecies): void {
  const problems = validatePlantSpecies(species);
  if (problems.length > 0) throw new Error(`plant species ${species.id}: ${problems.join("; ")}`);
  registry.set(species.id, species);
}

/**
 * A registered species, or undefined.
 * @capability plant-species register and validate plant species records: measured biology as plain data
 */
export function plantSpeciesById(id: string): PlantSpecies | undefined {
  return registry.get(id);
}

/**
 * Every registered species id, sorted.
 * @capability plant-species register and validate plant species records: measured biology as plain data
 */
export function plantSpeciesIds(): string[] {
  return [...registry.keys()].sort();
}
