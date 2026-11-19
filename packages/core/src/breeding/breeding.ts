// @skill jgengine-gameplay
import { changeMeter, createMeter, tickMeter, type MeterState } from "../stats/statPool";
import { evaluatePredicate, type Predicate } from "../rules/predicate";
import { tickCooldown } from "../time/cooldown";
import { createPhaseSchedule, type PhaseSchedule } from "../time/stateSchedule";

type Vec3 = readonly [number, number, number];

/** An egg's incubation condition and the seconds it survives while the condition fails before it is lost. */
export interface BreedingEggSpec {
  incubation: Predicate;
  healthSeconds: number;
}

export interface GrowthStage {
  id: string;
  share: number;
}

export interface BreedingSpecies {
  /** Seconds a pair must stay together to conceive. */
  mateSeconds: number;
  /** How close, in metres, a pair must stand to mate. */
  mateRange: number;
  /** Seconds from conception to laying, or from conception to birth. */
  carrySeconds: number;
  /** Set when the young are laid as an egg that hatches in a temperature band; null when the mother carries them to birth. */
  egg: BreedingEggSpec | null;
  /** Seconds from birth or hatching to fully grown, split across the game's stages. */
  maturationSeconds: number;
  /** Seconds a mother waits, between these two, after laying or giving birth before she can mate again (counted down by tickCooldown). */
  cooldownSeconds: readonly [number, number];
}

export interface MateCandidate {
  id: string;
  species: string;
  sex: "female" | "male";
  at: Vec3;
}

export interface BreedingSpeeds {
  pair: number;
  carry: number;
  grow: number;
  bond: number;
}

export interface BreedingOptions<P> {
  /** How a species breeds; null for one that cannot. */
  species(id: string): BreedingSpecies | null;
  conceive(mother: string, father: string, rng: () => number): P;
  /** Seconds between a young one's care requests. */
  careIntervalSeconds: number;
  careKinds: readonly string[];
  stages: readonly GrowthStage[];
  litter?(rng: () => number): number;
}

export interface BreedingEgg<P> {
  id: string;
  species: string;
  mother: string;
  at: Vec3;
  offspring: P;
  /** Incubation done, 0 to 1. */
  progress: number;
  /** Egg health, 0 to 1; it drops out of its temperature and the egg is lost at 0. */
  health: number;
}

/** A mother carrying her young, with their genes `P` and how far along the carrying is (0-1). */
export interface BreedingPregnancy<P> {
  mother: string;
  species: string;
  offspring: P[];
  /** Carrying done, 0 to 1. */
  progress: number;
}

/** A young one growing up: its stage, how far it has grown (0-1), its bond (0-1), the care it wants now and when it next asks. */
export interface BreedingOffspring {
  id: string;
  species: string;
  stage: string;
  /** Growing, 0 to 1. */
  matured: number;
  /** How much of the bond it has earned, 0 to 1. */
  bond: number;
  wants: string | null;
  nextCareAt: number;
}

export type BreedingEvent<P> =
  | { type: "conceived"; mother: string; father: string; species: string; count: number }
  | { type: "laid"; egg: BreedingEgg<P> }
  | { type: "hatched"; egg: BreedingEgg<P> }
  | { type: "eggLost"; egg: BreedingEgg<P> }
  | { type: "born"; mother: string; species: string; offspring: P }
  | { type: "wants"; offspring: string; care: string }
  | { type: "grown"; offspring: string; bond: number };

export interface BreedingSnapshot<P> {
  seq: number;
  mating: Record<string, { father: string; progress: number }>;
  /** Seconds each resting mother still waits. */
  cooldowns: Record<string, number>;
  pregnancies: BreedingPregnancy<P>[];
  eggs: BreedingEgg<P>[];
  offspring: BreedingOffspring[];
  speeds: BreedingSpeeds;
}

export interface BreedingField<P> {
  mate(candidates: readonly MateCandidate[], dt: number, rng: () => number): BreedingEvent<P>[];
  tick(now: number, dt: number, temperatureAt: (at: Vec3) => number, rng: () => number): BreedingEvent<P>[];
  raise(id: string, species: string, now: number): BreedingOffspring;
  care(id: string, kind: string): number;
  /** A mother's mating bar, 0 to 1, or null when she is not mating. */
  matingProgress(mother: string): number | null;
  /** Seconds until a mother can mate again; 0 when she can. */
  cooldown(mother: string): number;
  pregnancy(mother: string): Readonly<BreedingPregnancy<P>> | null;
  eggs(): readonly Readonly<BreedingEgg<P>>[];
  removeEgg(id: string): BreedingEgg<P> | null;
  offspring(): readonly Readonly<BreedingOffspring>[];
  offspringOf(id: string): Readonly<BreedingOffspring> | null;
  forget(id: string): void;
  speeds(): BreedingSpeeds;
  setSpeeds(speeds: Partial<BreedingSpeeds>): void;
  snapshot(): BreedingSnapshot<P>;
  restore(snapshot: BreedingSnapshot<P>): void;
  reset(): void;
}

interface EggState<P> {
  id: string;
  species: string;
  mother: string;
  at: Vec3;
  offspring: P;
  progress: MeterState;
  health: MeterState;
}

interface PregnancyState<P> {
  mother: string;
  species: string;
  offspring: P[];
  progress: MeterState;
}

interface OffspringState {
  id: string;
  species: string;
  growth: PhaseSchedule<string>;
  /** Seconds grown so far, of the species' maturation time. */
  grown: number;
  bond: MeterState;
  wants: string | null;
  nextCareAt: number;
}

interface MateState {
  father: string;
  meter: MeterState;
}

const ONE: BreedingSpeeds = { pair: 1, carry: 1, grow: 1, bond: 1 };

const zeroed = (): MeterState => createMeter({ max: 1, current: 0 });
const ofValue = (value: number): MeterState => createMeter({ max: 1, current: value });
const fraction = (meter: MeterState): number => meter.pool.current;
const fill = (meter: MeterState, perSecond: number, dt: number): MeterState => tickMeter(meter, { regen: perSecond }, dt).meter;
const drain = (meter: MeterState, perSecond: number, dt: number): MeterState => tickMeter(meter, { decay: perSecond }, dt).meter;

const viewEgg = <P>(egg: EggState<P>): BreedingEgg<P> => ({
  id: egg.id,
  species: egg.species,
  mother: egg.mother,
  at: egg.at,
  offspring: egg.offspring,
  progress: fraction(egg.progress),
  health: fraction(egg.health),
});

/** @capability breeding pairs mate, eggs hatch in a game's temperature band or mothers carry, and the young grow, stage and bond through care */
export function createBreedingField<P>(options: BreedingOptions<P>): BreedingField<P> {
  const litter = options.litter ?? (() => 1);

  let mating = new Map<string, MateState>();
  let cooldowns = new Map<string, number>();
  let pregnancies = new Map<string, PregnancyState<P>>();
  let eggs = new Map<string, EggState<P>>();
  let offspring = new Map<string, OffspringState>();
  let speeds: BreedingSpeeds = { ...ONE };
  let seq = 0;

  const speciesOf = (id: string): BreedingSpecies => {
    const def = options.species(id);
    if (def === null) throw new Error(`breeding: ${id} cannot breed`);
    return def;
  };
  const rest = (mother: string, species: BreedingSpecies, rng: () => number): void => {
    const [low, high] = species.cooldownSeconds;
    cooldowns.set(mother, (low + rng() * (high - low)) / speeds.pair);
  };
  // Each answered request adds the share of the bond that one care interval is worth.
  const bondShare = (species: BreedingSpecies): number =>
    Math.min(1, options.careIntervalSeconds / speeds.bond / (species.maturationSeconds / speeds.grow));
  const growthOf = (species: BreedingSpecies): PhaseSchedule<string> =>
    createPhaseSchedule({ phases: options.stages.map((stage) => ({ state: stage.id, durationSeconds: stage.share * species.maturationSeconds })) });
  const view = (young: OffspringState): BreedingOffspring => {
    const matured = Math.min(1, young.grown / speciesOf(young.species).maturationSeconds);
    return {
      id: young.id,
      species: young.species,
      stage: young.growth.state(),
      matured,
      bond: fraction(young.bond),
      wants: young.wants,
      nextCareAt: young.nextCareAt,
    };
  };

  return {
    mate(candidates, dt, rng) {
      const events: BreedingEvent<P>[] = [];
      const busy = new Set<string>();
      const seen = new Set<string>();
      for (const mother of candidates) {
        if (mother.sex !== "female") continue;
        const def = options.species(mother.species);
        if (def === null || pregnancies.has(mother.id) || (cooldowns.get(mother.id) ?? 0) > 0) continue;
        let father: MateCandidate | null = null;
        let best = def.mateRange;
        for (const male of candidates) {
          if (male.sex !== "male" || male.species !== mother.species || busy.has(male.id)) continue;
          const distance = Math.hypot(male.at[0] - mother.at[0], male.at[2] - mother.at[2]);
          if (distance <= best) {
            best = distance;
            father = male;
          }
        }
        if (father === null) continue;
        const sire: MateCandidate = father;
        seen.add(mother.id);
        busy.add(sire.id);
        const bar = mating.get(mother.id);
        const meter = bar !== undefined && bar.father === sire.id ? bar.meter : zeroed();
        const together = changeMeter(meter, dt / def.mateSeconds);
        if (!together.change.hitMax) {
          mating.set(mother.id, { father: sire.id, meter: together.meter });
          continue;
        }
        mating.delete(mother.id);
        const count = litter(rng);
        const brood = Array.from({ length: count }, () => options.conceive(mother.id, sire.id, rng));
        events.push({ type: "conceived", mother: mother.id, father: sire.id, species: mother.species, count });
        if (def.egg === null) {
          pregnancies.set(mother.id, { mother: mother.id, species: mother.species, offspring: brood, progress: zeroed() });
          continue;
        }
        for (const young of brood) {
          seq += 1;
          const egg: EggState<P> = { id: `egg_${seq}`, species: mother.species, mother: mother.id, at: [mother.at[0], mother.at[1], mother.at[2]], offspring: young, progress: zeroed(), health: ofValue(1) };
          eggs.set(egg.id, egg);
          events.push({ type: "laid", egg: viewEgg(egg) });
        }
        rest(mother.id, def, rng);
      }
      // A pair that drifted apart starts over.
      for (const id of [...mating.keys()]) if (!seen.has(id)) mating.delete(id);
      return events;
    },
    tick(now, dt, temperatureAt, rng) {
      const events: BreedingEvent<P>[] = [];
      for (const [mother, left] of cooldowns) {
        const next = tickCooldown(left, dt);
        if (next > 0) cooldowns.set(mother, next);
        else cooldowns.delete(mother);
      }
      for (const egg of [...eggs.values()]) {
        const def = speciesOf(egg.species);
        const spec = def.egg;
        if (evaluatePredicate(spec?.incubation, { temperature: temperatureAt(egg.at) })) egg.progress = fill(egg.progress, speeds.carry / def.carrySeconds, dt);
        else egg.health = drain(egg.health, 1 / (spec?.healthSeconds ?? 1), dt);
        if (fraction(egg.health) <= 0) {
          eggs.delete(egg.id);
          events.push({ type: "eggLost", egg: viewEgg(egg) });
        } else if (fraction(egg.progress) >= 1) {
          eggs.delete(egg.id);
          events.push({ type: "hatched", egg: viewEgg(egg) });
        }
      }
      for (const carried of [...pregnancies.values()]) {
        const def = speciesOf(carried.species);
        carried.progress = fill(carried.progress, speeds.carry / def.carrySeconds, dt);
        if (fraction(carried.progress) < 1) continue;
        pregnancies.delete(carried.mother);
        for (const young of carried.offspring) events.push({ type: "born", mother: carried.mother, species: carried.species, offspring: young });
        rest(carried.mother, def, rng);
      }
      for (const young of [...offspring.values()]) {
        const grew = dt * speeds.grow;
        young.grown += grew;
        young.growth.tick(grew);
        if (young.growth.ended()) {
          offspring.delete(young.id);
          events.push({ type: "grown", offspring: young.id, bond: fraction(young.bond) });
          continue;
        }
        if (now >= young.nextCareAt) {
          // A new request replaces one left unanswered: no penalty, no gain.
          const kinds = options.careKinds;
          young.wants = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))] ?? null;
          young.nextCareAt = now + options.careIntervalSeconds / speeds.bond;
          if (young.wants !== null) events.push({ type: "wants", offspring: young.id, care: young.wants });
        }
      }
      return events;
    },
    raise(id, species, now) {
      const young: OffspringState = { id, species, growth: growthOf(speciesOf(species)), grown: 0, bond: zeroed(), wants: null, nextCareAt: now + options.careIntervalSeconds / speeds.bond };
      offspring.set(id, young);
      return view(young);
    },
    care(id, kind) {
      const young = offspring.get(id);
      if (young === undefined || young.wants !== kind) return 0;
      const grown = changeMeter(young.bond, bondShare(speciesOf(young.species)));
      young.bond = grown.meter;
      young.wants = null;
      return grown.change.applied;
    },
    matingProgress(mother) {
      const bar = mating.get(mother);
      return bar === undefined ? null : fraction(bar.meter);
    },
    cooldown: (mother) => cooldowns.get(mother) ?? 0,
    pregnancy(mother) {
      const carried = pregnancies.get(mother);
      return carried === undefined ? null : { mother: carried.mother, species: carried.species, offspring: carried.offspring, progress: fraction(carried.progress) };
    },
    eggs: () => [...eggs.values()].map(viewEgg),
    removeEgg(id) {
      const egg = eggs.get(id);
      eggs.delete(id);
      return egg === undefined ? null : viewEgg(egg);
    },
    offspring: () => [...offspring.values()].map(view),
    offspringOf(id) {
      const young = offspring.get(id);
      return young === undefined ? null : view(young);
    },
    forget(id) {
      mating.delete(id);
      for (const [mother, bar] of mating) if (bar.father === id) mating.delete(mother);
      cooldowns.delete(id);
      pregnancies.delete(id);
      offspring.delete(id);
    },
    speeds: () => ({ ...speeds }),
    setSpeeds(next) {
      speeds = { ...speeds, ...next };
    },
    snapshot: () =>
      structuredClone({
        seq,
        mating: Object.fromEntries([...mating].map(([mother, bar]) => [mother, { father: bar.father, progress: fraction(bar.meter) }])),
        cooldowns: Object.fromEntries(cooldowns),
        pregnancies: [...pregnancies.values()].map((carried) => ({ mother: carried.mother, species: carried.species, offspring: carried.offspring, progress: fraction(carried.progress) })),
        eggs: [...eggs.values()].map(viewEgg),
        offspring: [...offspring.values()].map(view),
        speeds,
      }),
    restore(snapshot) {
      const copy = structuredClone(snapshot);
      seq = copy.seq;
      mating = new Map(Object.entries(copy.mating).map(([mother, bar]) => [mother, { father: bar.father, meter: ofValue(bar.progress) }]));
      cooldowns = new Map(Object.entries(copy.cooldowns));
      pregnancies = new Map(copy.pregnancies.map((carried) => [carried.mother, { mother: carried.mother, species: carried.species, offspring: carried.offspring, progress: ofValue(carried.progress) }]));
      eggs = new Map(
        copy.eggs.map((egg) => [
          egg.id,
          { id: egg.id, species: egg.species, mother: egg.mother, at: egg.at, offspring: egg.offspring, progress: ofValue(egg.progress), health: ofValue(egg.health) },
        ]),
      );
      offspring = new Map(
        copy.offspring.map((young) => {
          const species = speciesOf(young.species);
          const growth = growthOf(species);
          const grown = young.matured * species.maturationSeconds;
          growth.tick(grown);
          return [young.id, { id: young.id, species: young.species, growth, grown, bond: ofValue(young.bond), wants: young.wants, nextCareAt: young.nextCareAt }];
        }),
      );
      speeds = copy.speeds;
    },
    reset() {
      mating = new Map();
      cooldowns = new Map();
      pregnancies = new Map();
      eggs = new Map();
      offspring = new Map();
      speeds = { ...ONE };
      seq = 0;
    },
  };
}
