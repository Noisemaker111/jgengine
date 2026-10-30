// @skill jgengine-gameplay
import { changeMeter, createMeter, tickMeter, type MeterState } from "../stats/statPool";

type Vec3 = readonly [number, number, number];

/** How one species breeds. */
export interface BreedingSpecies {
  /** Egg layers lay a fertilised egg that must stay in its band; carriers grow the young inside the mother and give birth. */
  mode: "egg" | "carry";
  /** Seconds a pair must stay together to conceive. */
  mateSeconds: number;
  /** How close, in metres, a pair must stand to mate. */
  mateRange: number;
  /** Seconds from conception to laying, or from conception to birth. */
  carrySeconds: number;
  /** An egg's temperature band in °C, inclusive. Null for a carrier. */
  incubation: readonly [number, number] | null;
  /** Seconds an egg survives out of its band before it is lost. */
  eggHealthSeconds: number;
  /** Seconds from birth to grown. */
  maturationSeconds: number;
  /** Seconds a mother waits, between these two, after laying or giving birth before she can mate again. */
  cooldownSeconds: readonly [number, number];
}

/** A creature offered for mating this tick. */
export interface MateCandidate {
  id: string;
  species: string;
  sex: "female" | "male";
  at: Vec3;
}

/** How much faster each part of breeding runs than its times say. All start at 1. */
export interface BreedingSpeeds {
  /** A mother is ready to mate again this much sooner. */
  pair: number;
  /** Incubation and carrying. */
  carry: number;
  /** Growing. */
  grow: number;
  /** Care requests come this much more often. */
  bond: number;
}

/** {@link createBreedingField} setup. */
export interface BreedingOptions<P> {
  /** How a species breeds; null for one that cannot. */
  species(id: string): BreedingSpecies | null;
  /** What each young one of a pairing will be, rolled when the mother conceives. */
  conceive(mother: string, father: string, rng: () => number): P;
  /** Seconds between a young one's care requests. */
  careIntervalSeconds: number;
  /** The kinds of care it may ask for, one at random each time. */
  careKinds: readonly string[];
  /** Chance of twins and of triplets; omitted means one. */
  multiples?: { twins: number; triplets: number };
}

/** A fertilized egg lying where it was laid, carrying its young one's genes `P`; it progresses only inside its incubation band. */
export interface BreedingEgg<P> {
  id: string;
  species: string;
  mother: string;
  at: Vec3;
  baby: P;
  /** Incubation done, 0 to 1. */
  progress: number;
  /** Egg health, 0 to 1; it drops out of its temperature and the egg is lost at 0. */
  health: number;
}

/** A mother carrying her young, with their genes `P` and how far along the carrying is (0-1). */
export interface BreedingPregnancy<P> {
  mother: string;
  species: string;
  babies: P[];
  /** Carrying done, 0 to 1. */
  progress: number;
}

/** A young one growing into an adult: how far it has grown (0-1), its bond (0-1), the care it wants now and when it next asks. */
export interface BreedingBaby {
  id: string;
  species: string;
  /** Maturation, 0 to 1. */
  matured: number;
  /** How much of the bond it has earned, 0 to 1. */
  bond: number;
  /** The care it is asking for, or null between requests. */
  wants: string | null;
  /** When it next asks. */
  nextCareAt: number;
}

/** What happened this tick. */
export type BreedingEvent<P> =
  | { type: "conceived"; mother: string; father: string; species: string; count: number }
  | { type: "laid"; egg: BreedingEgg<P> }
  | { type: "hatched"; egg: BreedingEgg<P> }
  | { type: "eggLost"; egg: BreedingEgg<P> }
  | { type: "born"; mother: string; species: string; baby: P }
  | { type: "wants"; baby: string; care: string }
  | { type: "grown"; baby: string; bond: number };

/** Everything a breeding field holds, for a save: mating progress, cooldowns, pregnancies, eggs, babies and speeds. */
export interface BreedingSnapshot<P> {
  seq: number;
  mating: Record<string, { father: string; progress: number }>;
  cooldowns: Record<string, number>;
  pregnancies: BreedingPregnancy<P>[];
  eggs: BreedingEgg<P>[];
  babies: BreedingBaby[];
  speeds: BreedingSpeeds;
}

/** The breeding of a world's tames, made by {@link createBreedingField}. */
export interface BreedingField<P> {
  /**
   * Pairs mating: each ready mother with the nearest willing male of her kind in range fills her mating bar; apart,
   * it starts over. A full bar lays an egg where she stands or makes her pregnant.
   */
  mate(candidates: readonly MateCandidate[], now: number, dt: number, rng: () => number): BreedingEvent<P>[];
  /** Eggs incubate in their temperature (and lose health out of it), mothers carry, babies grow and ask for care. */
  tick(now: number, dt: number, temperatureAt: (at: Vec3) => number, rng: () => number): BreedingEvent<P>[];
  /** Start raising a hatched or newborn baby: it grows from 0 and first asks for care one interval in. */
  raise(id: string, species: string, now: number): BreedingBaby;
  /** Give a baby care: the kind it asked for adds its share of bond and clears the request. Returns the bond gained. */
  care(id: string, kind: string): number;
  /** A mother's mating bar, 0 to 1, or null when she is not mating. */
  matingProgress(mother: string): number | null;
  /** Seconds until a mother can mate again; 0 when she can. */
  cooldown(mother: string, now: number): number;
  pregnancy(mother: string): Readonly<BreedingPregnancy<P>> | null;
  eggs(): readonly Readonly<BreedingEgg<P>>[];
  /** Take an egg out of the world (picked up, eaten); returns it. */
  removeEgg(id: string): BreedingEgg<P> | null;
  baby(id: string): Readonly<BreedingBaby> | null;
  babies(): readonly Readonly<BreedingBaby>[];
  /** A creature gone (killed, released): its mating, pregnancy and baby record go too. */
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
  baby: P;
  progress: MeterState;
  health: MeterState;
}

interface PregnancyState<P> {
  mother: string;
  species: string;
  babies: P[];
  progress: MeterState;
}

interface BabyState {
  id: string;
  species: string;
  matured: MeterState;
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
  baby: egg.baby,
  progress: fraction(egg.progress),
  health: fraction(egg.health),
});

const viewBaby = (baby: BabyState): BreedingBaby => ({
  id: baby.id,
  species: baby.species,
  matured: fraction(baby.matured),
  bond: fraction(baby.bond),
  wants: baby.wants,
  nextCareAt: baby.nextCareAt,
});

/**
 * Tame pairs left together mate, a mother lays a fertilised egg that hatches only kept in its temperature or carries a
 * baby to birth, then waits a while before mating again. The young, rolled at conception, grow at the species' pace and
 * ask for care on an interval; each answered request adds its share of bond, full bond when every request in its growing
 * time was answered. Species times, care kinds, the size of a litter and what a young one is all come from the game.
 * @capability breeding tame pairs mate, eggs incubate by temperature or mothers carry, the young grow and bond through care
 */
export function createBreedingField<P>(options: BreedingOptions<P>): BreedingField<P> {
  const multiples = options.multiples ?? { twins: 0, triplets: 0 };
  let mating = new Map<string, MateState>();
  let cooldowns = new Map<string, number>();
  let pregnancies = new Map<string, PregnancyState<P>>();
  let eggs = new Map<string, EggState<P>>();
  let babies = new Map<string, BabyState>();
  let speeds: BreedingSpeeds = { ...ONE };
  let seq = 0;

  const speciesOf = (id: string): BreedingSpecies => {
    const def = options.species(id);
    if (def === null) throw new Error(`breeding: ${id} cannot breed`);
    return def;
  };
  const rest = (mother: string, species: BreedingSpecies, now: number, rng: () => number): void => {
    const [low, high] = species.cooldownSeconds;
    cooldowns.set(mother, now + (low + rng() * (high - low)) / speeds.pair);
  };
  const litter = (rng: () => number): number => {
    const roll = rng();
    return roll < multiples.triplets ? 3 : roll < multiples.triplets + multiples.twins ? 2 : 1;
  };
  // Answering every request over the growing time earns the whole bond.
  const bondShare = (species: BreedingSpecies): number =>
    Math.min(1, options.careIntervalSeconds / speeds.bond / (species.maturationSeconds / speeds.grow));

  return {
    mate(candidates, now, dt, rng) {
      const events: BreedingEvent<P>[] = [];
      const busy = new Set<string>();
      const seen = new Set<string>();
      for (const mother of candidates) {
        if (mother.sex !== "female") continue;
        const def = options.species(mother.species);
        if (def === null || pregnancies.has(mother.id) || (cooldowns.get(mother.id) ?? -Infinity) > now) continue;
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
        if (def.mode === "carry") {
          pregnancies.set(mother.id, { mother: mother.id, species: mother.species, babies: brood, progress: zeroed() });
          continue;
        }
        for (const baby of brood) {
          seq += 1;
          const egg: EggState<P> = { id: `egg_${seq}`, species: mother.species, mother: mother.id, at: [mother.at[0], mother.at[1], mother.at[2]], baby, progress: zeroed(), health: ofValue(1) };
          eggs.set(egg.id, egg);
          events.push({ type: "laid", egg: viewEgg(egg) });
        }
        rest(mother.id, def, now, rng);
      }
      // A pair that drifted apart starts over.
      for (const id of [...mating.keys()]) if (!seen.has(id)) mating.delete(id);
      return events;
    },
    tick(now, dt, temperatureAt, rng) {
      const events: BreedingEvent<P>[] = [];
      for (const egg of [...eggs.values()]) {
        const def = speciesOf(egg.species);
        const [low, high] = def.incubation ?? [-Infinity, Infinity];
        const temperature = temperatureAt(egg.at);
        if (temperature >= low && temperature <= high) egg.progress = fill(egg.progress, speeds.carry / def.carrySeconds, dt);
        else egg.health = drain(egg.health, 1 / def.eggHealthSeconds, dt);
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
        for (const baby of carried.babies) events.push({ type: "born", mother: carried.mother, species: carried.species, baby });
        rest(carried.mother, def, now, rng);
      }
      for (const baby of [...babies.values()]) {
        const def = speciesOf(baby.species);
        baby.matured = fill(baby.matured, speeds.grow / def.maturationSeconds, dt);
        if (fraction(baby.matured) >= 1) {
          babies.delete(baby.id);
          events.push({ type: "grown", baby: baby.id, bond: fraction(baby.bond) });
          continue;
        }
        if (now >= baby.nextCareAt) {
          // A new request replaces one left unanswered: no penalty, no gain.
          const kinds = options.careKinds;
          baby.wants = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))] ?? null;
          baby.nextCareAt = now + options.careIntervalSeconds / speeds.bond;
          if (baby.wants !== null) events.push({ type: "wants", baby: baby.id, care: baby.wants });
        }
      }
      return events;
    },
    raise(id, species, now) {
      speciesOf(species);
      const baby: BabyState = { id, species, matured: zeroed(), bond: zeroed(), wants: null, nextCareAt: now + options.careIntervalSeconds / speeds.bond };
      babies.set(id, baby);
      return viewBaby(baby);
    },
    care(id, kind) {
      const baby = babies.get(id);
      if (baby === undefined || baby.wants !== kind) return 0;
      const grown = changeMeter(baby.bond, bondShare(speciesOf(baby.species)));
      baby.bond = grown.meter;
      baby.wants = null;
      return grown.change.applied;
    },
    matingProgress(mother) {
      const bar = mating.get(mother);
      return bar === undefined ? null : fraction(bar.meter);
    },
    cooldown: (mother, now) => Math.max(0, (cooldowns.get(mother) ?? 0) - now),
    pregnancy(mother) {
      const carried = pregnancies.get(mother);
      return carried === undefined ? null : { mother: carried.mother, species: carried.species, babies: carried.babies, progress: fraction(carried.progress) };
    },
    eggs: () => [...eggs.values()].map(viewEgg),
    removeEgg(id) {
      const egg = eggs.get(id);
      eggs.delete(id);
      return egg === undefined ? null : viewEgg(egg);
    },
    baby(id) {
      const baby = babies.get(id);
      return baby === undefined ? null : viewBaby(baby);
    },
    babies: () => [...babies.values()].map(viewBaby),
    forget(id) {
      mating.delete(id);
      for (const [mother, bar] of mating) if (bar.father === id) mating.delete(mother);
      cooldowns.delete(id);
      pregnancies.delete(id);
      babies.delete(id);
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
        pregnancies: [...pregnancies.values()].map((carried) => ({ mother: carried.mother, species: carried.species, babies: carried.babies, progress: fraction(carried.progress) })),
        eggs: [...eggs.values()].map(viewEgg),
        babies: [...babies.values()].map(viewBaby),
        speeds,
      }),
    restore(snapshot) {
      const copy = structuredClone(snapshot);
      seq = copy.seq;
      mating = new Map(Object.entries(copy.mating).map(([mother, bar]) => [mother, { father: bar.father, meter: ofValue(bar.progress) }]));
      cooldowns = new Map(Object.entries(copy.cooldowns));
      pregnancies = new Map(copy.pregnancies.map((carried) => [carried.mother, { mother: carried.mother, species: carried.species, babies: carried.babies, progress: ofValue(carried.progress) }]));
      eggs = new Map(
        copy.eggs.map((egg) => [
          egg.id,
          { id: egg.id, species: egg.species, mother: egg.mother, at: egg.at, baby: egg.baby, progress: ofValue(egg.progress), health: ofValue(egg.health) },
        ]),
      );
      babies = new Map(
        copy.babies.map((baby) => [baby.id, { id: baby.id, species: baby.species, matured: ofValue(baby.matured), bond: ofValue(baby.bond), wants: baby.wants, nextCareAt: baby.nextCareAt }]),
      );
      speeds = copy.speeds;
    },
    reset() {
      mating = new Map();
      cooldowns = new Map();
      pregnancies = new Map();
      eggs = new Map();
      babies = new Map();
      speeds = { ...ONE };
      seq = 0;
    },
  };
}
