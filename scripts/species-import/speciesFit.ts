import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import { createCmaEs } from "./cmaEs";
import type { TrialScore } from "./speciesScore";
import type { Trial } from "./speciesTrial";

/** One fitted parameter: its path in the record and the range the search may move it in. */
export interface FitParameter {
  path: string;
  lo: number;
  hi: number;
  integer?: boolean;
  log?: boolean;
}

/**
 * The growth and carbon parameters a species fit searches (Stava et al. 2014 fit L-system parameters
 * to target trees the same way: a black-box search scoring grown plants against measurements). Every
 * other value is a measured trait.
 */
export const FIT_PARAMETERS: readonly FitParameter[] = [
  // Every tree grows a strong leader while young; decurrent ones lose it only with age (Brown,
  // McAlpine & Kormanik 1967), so a fit may not buy a low fork with a weak seedling leader.
  { path: "growth.apicalControl", lo: 0.75, hi: 0.95 },
  { path: "growth.apicalControlMature", lo: 0.3, hi: 0.9 },
  { path: "growth.apicalControlHalfYears", lo: 1, hi: 80, log: true },
  { path: "growth.internodeMax", lo: 0.04, hi: 0.2, log: true },
  { path: "growth.branchAngle", lo: 35, hi: 85 },
  { path: "growth.maxMetamersPerShoot", lo: 3, hi: 10, integer: true },
  { path: "growth.establishmentYears", lo: 0, hi: 25 },
  { path: "growth.horizontalVigour", lo: 0.03, hi: 0.8, log: true },
  { path: "growth.vigourIndexWeight", lo: 0.02, hi: 0.8 },
  { path: "growth.tropism.gravity", lo: 0.05, hi: 0.6 },
  { path: "growth.tropism.setpointAngle", lo: 30, hi: 90 },
  { path: "growth.tropism.setpointPerOrder", lo: 0, hi: 25 },
  { path: "growth.tropism.optimal", lo: 0, hi: 0.4 },
  { path: "growth.budLightThreshold", lo: 0.02, hi: 0.2, log: true },
  { path: "growth.spurYears", lo: 2, hi: 30, integer: true },
  { path: "carbon.lueGPerMJ", lo: 1, hi: 5, log: true },
  { path: "carbon.lightHalfSaturation", lo: 0.2, hi: 1.5, log: true },
  { path: "carbon.respiration", lo: 0.6, hi: 3, log: true },
  { path: "carbon.hydraulicExponent", lo: 1, hi: 8, integer: true },
  { path: "carbon.hydraulicHeightShare", lo: 0.4, hi: 1 },
];

type Bag = Record<string, unknown>;
const isBag = (value: unknown): value is Bag => typeof value === "object" && value !== null;

function readPath(record: unknown, path: string): number {
  let at: unknown = record;
  for (const part of path.split(".")) at = isBag(at) ? at[part] : undefined;
  return typeof at === "number" ? at : Number.NaN;
}

function writePath(record: unknown, path: string, value: number): void {
  const parts = path.split(".");
  const last = parts.pop() ?? "";
  let at: unknown = record;
  for (const part of parts) at = isBag(at) ? at[part] : undefined;
  if (isBag(at)) at[last] = value;
}

function toUnit(p: FitParameter, value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  const u = p.log ? Math.log(value / p.lo) / Math.log(p.hi / p.lo) : (value - p.lo) / (p.hi - p.lo);
  return Math.min(1, Math.max(0, u));
}

function fromUnit(p: FitParameter, u: number): number {
  const c = Math.min(1, Math.max(0, u));
  const value = p.log ? p.lo * (p.hi / p.lo) ** c : p.lo + (p.hi - p.lo) * c;
  return p.integer ? Math.round(value) : Number(value.toPrecision(4));
}

/** `base` with the fitted parameters set from a point of the unit cube. */
export function speciesAt(base: PlantSpecies, point: readonly number[], parameters: readonly FitParameter[] = FIT_PARAMETERS): PlantSpecies {
  const species = structuredClone(base);
  parameters.forEach((p, i) => writePath(species, p.path, fromUnit(p, point[i] ?? 0.5)));
  // Apical control only weakens with age (validatePlantSpecies).
  species.growth.apicalControlMature = Math.min(species.growth.apicalControlMature, species.growth.apicalControl);
  return species;
}

/** Grows a species and returns its trial; a worker pool in practice. */
export type Evaluate = (species: PlantSpecies) => Promise<Trial | null>;

export interface FitProgress {
  generation: number;
  score: number;
  parts: Record<string, number>;
  species: PlantSpecies;
}

/**
 * Search the fitted parameters of `start` with CMA-ES until `generations` pass, reporting each new
 * best. Deterministic for a given `seed` and evaluator.
 */
export async function fitSpecies(
  start: PlantSpecies,
  scoreTrial: (trial: Trial) => TrialScore,
  evaluate: Evaluate,
  options: {
    generations: number;
    lambda: number;
    sigma: number;
    seed: number;
    parameters?: readonly FitParameter[];
    onBest: (best: FitProgress) => void;
    onGeneration?: (line: string) => void;
    /** Stop early once the best so far is good enough. */
    until?: (best: FitProgress) => boolean;
  },
): Promise<FitProgress> {
  const parameters = options.parameters ?? FIT_PARAMETERS;
  const at = (point: readonly number[]): PlantSpecies => speciesAt(start, point, parameters);
  const origin = parameters.map((p) => toUnit(p, readPath(start, p.path)));
  const first = await evaluate(at(origin));
  const firstScore = first === null ? { total: 1e9, parts: {} } : scoreTrial(first);
  let best: FitProgress = { generation: 0, score: firstScore.total, parts: firstScore.parts, species: at(origin) };
  options.onBest(best);
  if (options.until?.(best) === true) return best;
  const search = createCmaEs(origin, options.sigma, options.lambda, options.seed);
  for (let generation = 1; generation <= options.generations; generation += 1) {
    const population = search.ask();
    const trials = await Promise.all(population.map((point) => evaluate(at(point))));
    const scores = trials.map((trial) => (trial === null ? 1e9 : scoreTrial(trial).total));
    const outside = population.map((point) => 50 * point.reduce((s, x) => s + (x < 0 ? x * x : x > 1 ? (x - 1) ** 2 : 0), 0));
    search.tell(population, scores.map((s, i) => s + (outside[i] ?? 0)));
    const k = scores.indexOf(Math.min(...scores));
    const trial = trials[k];
    const point = population[k];
    if (trial !== null && trial !== undefined && point !== undefined && (scores[k] ?? 1e9) < best.score) {
      const scored = scoreTrial(trial);
      best = { generation, score: scored.total, parts: scored.parts, species: at(point) };
      options.onBest(best);
    }
    if (options.until?.(best) === true) {
      options.onGeneration?.(`gen ${generation} stopped at ${best.score.toFixed(2)}: within the library test's limits`);
      return best;
    }
    options.onGeneration?.(`gen ${generation} best ${best.score.toFixed(2)} sigma ${search.sigma.toFixed(3)} ${JSON.stringify(Object.fromEntries(Object.entries(best.parts).map(([k2, v]) => [k2, Number(v.toFixed(2))])))}`);
  }
  return best;
}
