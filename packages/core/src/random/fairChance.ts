import { shuffleWithRng } from "./pick";
import { hashUnit, seededRng } from "./rng";

/** How a run of chance rolls is dealt. */
export interface FairChanceOptions {
  /**
   * Rolls dealt together (default 4). Each bag holds the successes the odds owe it, in shuffled order, so a
   * run of wins or losses never spans much more than two bags. Smaller bags feel more even, larger ones wilder.
   */
  bag?: number;
}

/**
 * Whether roll `index` of the chance named `key` succeeds, dealt from shuffled bags like a deck of cards:
 * over any stretch of rolls the share that succeed stays at `chance`, so a 70% roll can't miss nine times
 * running or a 30% one hit nine times running. Stateless and replayable: the same key and index always
 * answer the same, so a reloaded world rolls exactly as before. Put the world's seed in `key` to give each
 * run its own luck.
 *
 * @capability fair-chance chance rolls with the right odds and no long lucky or unlucky streaks
 */
export function fairChance(key: string, index: number, chance: number, options: FairChanceOptions = {}): boolean {
  if (!(chance > 0)) return false;
  if (chance >= 1) return true;
  const size = Math.max(1, Math.floor(options.bag ?? 4));
  const roll = Math.max(0, Math.floor(index));
  const bag = Math.floor(roll / size);
  const phase = hashUnit(`${key}:phase`);
  const owed = (at: number) => Math.floor(at * size * chance + phase);
  const wins = owed(bag + 1) - owed(bag);
  const order = shuffleWithRng(
    Array.from({ length: size }, (_, slot) => slot),
    seededRng(`${key}:bag:${bag}`),
  );
  return order.indexOf(roll % size) < wins;
}

/**
 * The longest run of equal results in `results` and which result it was, for tests that check a random
 * system does not hand out streaks the odds don't explain.
 *
 * @capability fair-chance chance rolls with the right odds and no long lucky or unlucky streaks
 */
export function longestStreak(results: readonly boolean[]): { length: number; value: boolean | null } {
  let length = 0;
  let value: boolean | null = null;
  let run = 0;
  let previous: boolean | null = null;
  for (const result of results) {
    run = result === previous ? run + 1 : 1;
    previous = result;
    if (run > length) {
      length = run;
      value = result;
    }
  }
  return { length, value };
}
