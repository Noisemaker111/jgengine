// @skill jgengine-gameplay
type Vec3 = readonly [number, number, number];

/** How one species breeds. */
export interface BreedingSpecies {
  /** Egg layers lay a fertilised egg that must be kept warm; mammals carry the baby and give birth. */
  mode: "egg" | "gestation";
  /** Seconds an egg incubates in its temperature, or a mother carries. */
  carrySeconds: number;
  /** An egg's incubation range in °C, inclusive. Null for mammals. */
  incubation: readonly [number, number] | null;
  /** Seconds from hatching or birth to grown. */
  maturationSeconds: number;
  /** Seconds a pair must stay together for the mother to conceive. */
  mateSeconds: number;
  /** How close, in metres, a pair must stand to mate. */
  mateRange: number;
  /** Seconds a mother waits, between these two, after laying or giving birth before she can mate again. */
  cooldownSeconds: readonly [number, number];
}

/** A tame offered for mating this tick. */
export interface MateCandidate {
  id: string;
  species: string;
  sex: "female" | "male";
  at: Vec3;
}

/** ARK's server multipliers: how much faster each part of breeding runs. All default 1. */
export interface BreedingSpeeds {
  /** Mating interval: a mother is ready again this much sooner. */
  mating: number;
  /** Egg hatch and gestation. */
  hatch: number;
  /** Baby maturation. */
  mature: number;
  /** Care requests come this much more often (ARK's BabyCuddleIntervalMultiplier is its inverse). */
  care: number;
}

/** {@link createBreedingField} setup. */
export interface BreedingOptions<P> {
  /** How a species breeds; null for one that cannot. */
  species(id: string): BreedingSpecies | null;
  /** What each baby of a pairing will be, rolled when the mother conceives (ARK fixes a baby's stats then). */
  conceive(mother: string, father: string, rng: () => number): P;
  /** Seconds between a baby's care requests. ARK: 8 hours. */
  careIntervalSeconds: number;
  /** The kinds of care a baby may ask for, one at random each time. */
  careKinds: readonly string[];
  /** Seconds an egg survives out of its temperature before it is lost. */
  eggHealthSeconds: number;
  /** Chance of twins and of triplets. ARK: 0.1 and 0.02. */
  multiples?: { twins: number; triplets: number };
}

/** A fertilized egg lying where it was laid, carrying its baby's genes `P`; it progresses only inside its incubation band. */
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

/** A mother carrying her young, with the baby's genes `P` and how far along the gestation is (0-1). */
export interface BreedingPregnancy<P> {
  mother: string;
  species: string;
  babies: P[];
  /** Gestation done, 0 to 1. */
  progress: number;
}

/** A growing baby: how far it has matured (0-1), its imprint (0-1), the care it wants now and when it next asks. */
export interface BreedingBaby {
  id: string;
  species: string;
  /** Maturation, 0 to 1. */
  matured: number;
  /** How much of its imprint it has had, 0 to 1. */
  imprint: number;
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
  | { type: "grown"; baby: string; imprint: number };

/** ARK's baby stages by maturation: baby to 10%, juvenile to 50%, then adolescent. */
export type BabyStage = "baby" | "juvenile" | "adolescent" | "adult";

/** The stage a baby is at for how far it has matured (0-1). */
export function babyStage(matured: number): BabyStage {
  return matured >= 1 ? "adult" : matured >= 0.5 ? "adolescent" : matured >= 0.1 ? "juvenile" : "baby";
}

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
  /** Give a baby care: the kind it asked for adds its share of imprint and clears the request. Returns the imprint gained. */
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

const ONE: BreedingSpeeds = { mating: 1, hatch: 1, mature: 1, care: 1 };

/**
 * ARK-style breeding: tame pairs left together mate, a mother lays a fertilised egg that hatches only kept in its
 * temperature or carries a baby to birth, then waits a while before mating again. Babies, rolled at conception, grow
 * through baby, juvenile and adolescent to adult and ask for care on an interval; each answered request adds its share
 * of imprint, full imprint when every request in its growing time was answered.
 * @capability breeding tame pairs mate, eggs incubate by temperature or mothers gestate, babies grow and imprint through care
 */
export function createBreedingField<P>(options: BreedingOptions<P>): BreedingField<P> {
  const multiples = options.multiples ?? { twins: 0.1, triplets: 0.02 };
  let mating = new Map<string, { father: string; progress: number }>();
  let cooldowns = new Map<string, number>();
  let pregnancies = new Map<string, BreedingPregnancy<P>>();
  let eggs = new Map<string, BreedingEgg<P>>();
  let babies = new Map<string, BreedingBaby>();
  let speeds: BreedingSpeeds = { ...ONE };
  let seq = 0;

  const speciesOf = (id: string) => {
    const def = options.species(id);
    if (def === null) throw new Error(`breeding: ${id} cannot breed`);
    return def;
  };
  const rest = (mother: string, species: BreedingSpecies, now: number, rng: () => number) => {
    const [low, high] = species.cooldownSeconds;
    cooldowns.set(mother, now + (low + rng() * (high - low)) / speeds.mating);
  };
  const litter = (rng: () => number) => {
    const roll = rng();
    return roll < multiples.triplets ? 3 : roll < multiples.triplets + multiples.twins ? 2 : 1;
  };

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
        seen.add(mother.id);
        busy.add(father.id);
        const bar = mating.get(mother.id);
        const progress = (bar?.father === father.id ? bar.progress : 0) + dt / def.mateSeconds;
        if (progress < 1) {
          mating.set(mother.id, { father: father.id, progress });
          continue;
        }
        mating.delete(mother.id);
        const count = litter(rng);
        const brood = Array.from({ length: count }, () => options.conceive(mother.id, father!.id, rng));
        events.push({ type: "conceived", mother: mother.id, father: father.id, species: mother.species, count });
        if (def.mode === "gestation") {
          pregnancies.set(mother.id, { mother: mother.id, species: mother.species, babies: brood, progress: 0 });
          continue;
        }
        for (const baby of brood) {
          seq += 1;
          const egg: BreedingEgg<P> = { id: `egg_${seq}`, species: mother.species, mother: mother.id, at: [mother.at[0], mother.at[1], mother.at[2]], baby, progress: 0, health: 1 };
          eggs.set(egg.id, egg);
          events.push({ type: "laid", egg });
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
        if (temperature >= low && temperature <= high) egg.progress = Math.min(1, egg.progress + (dt * speeds.hatch) / def.carrySeconds);
        else egg.health = Math.max(0, egg.health - dt / options.eggHealthSeconds);
        if (egg.health <= 0) {
          eggs.delete(egg.id);
          events.push({ type: "eggLost", egg });
        } else if (egg.progress >= 1) {
          eggs.delete(egg.id);
          events.push({ type: "hatched", egg });
        }
      }
      for (const carried of [...pregnancies.values()]) {
        const def = speciesOf(carried.species);
        carried.progress = Math.min(1, carried.progress + (dt * speeds.hatch) / def.carrySeconds);
        if (carried.progress < 1) continue;
        pregnancies.delete(carried.mother);
        for (const baby of carried.babies) events.push({ type: "born", mother: carried.mother, species: carried.species, baby });
        rest(carried.mother, def, now, rng);
      }
      for (const baby of [...babies.values()]) {
        const def = speciesOf(baby.species);
        baby.matured = Math.min(1, baby.matured + (dt * speeds.mature) / def.maturationSeconds);
        if (baby.matured >= 1) {
          babies.delete(baby.id);
          events.push({ type: "grown", baby: baby.id, imprint: baby.imprint });
          continue;
        }
        if (now >= baby.nextCareAt) {
          // A new request replaces one left unanswered: no penalty, no gain, as in ARK.
          baby.wants = options.careKinds[Math.min(options.careKinds.length - 1, Math.floor(rng() * options.careKinds.length))] ?? null;
          baby.nextCareAt = now + options.careIntervalSeconds / speeds.care;
          if (baby.wants !== null) events.push({ type: "wants", baby: baby.id, care: baby.wants });
        }
      }
      return events;
    },
    raise(id, species, now) {
      speciesOf(species);
      const baby: BreedingBaby = { id, species, matured: 0, imprint: 0, wants: null, nextCareAt: now + options.careIntervalSeconds / speeds.care };
      babies.set(id, baby);
      return baby;
    },
    care(id, kind) {
      const baby = babies.get(id);
      if (baby === undefined || baby.wants !== kind) return 0;
      const def = speciesOf(baby.species);
      // Each request answered is one interval's share of the whole growing time (both at the same speeds).
      const share = Math.min(1, (options.careIntervalSeconds / speeds.care) / (def.maturationSeconds / speeds.mature));
      const gained = Math.min(1 - baby.imprint, share);
      baby.imprint += gained;
      baby.wants = null;
      return gained;
    },
    matingProgress: (mother) => mating.get(mother)?.progress ?? null,
    cooldown: (mother, now) => Math.max(0, (cooldowns.get(mother) ?? 0) - now),
    pregnancy: (mother) => pregnancies.get(mother) ?? null,
    eggs: () => [...eggs.values()],
    removeEgg(id) {
      const egg = eggs.get(id) ?? null;
      eggs.delete(id);
      return egg;
    },
    baby: (id) => babies.get(id) ?? null,
    babies: () => [...babies.values()],
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
        mating: Object.fromEntries(mating),
        cooldowns: Object.fromEntries(cooldowns),
        pregnancies: [...pregnancies.values()],
        eggs: [...eggs.values()],
        babies: [...babies.values()],
        speeds,
      }),
    restore(snapshot) {
      const copy = structuredClone(snapshot);
      seq = copy.seq;
      mating = new Map(Object.entries(copy.mating));
      cooldowns = new Map(Object.entries(copy.cooldowns));
      pregnancies = new Map(copy.pregnancies.map((entry) => [entry.mother, entry]));
      eggs = new Map(copy.eggs.map((entry) => [entry.id, entry]));
      babies = new Map(copy.babies.map((entry) => [entry.id, entry]));
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
