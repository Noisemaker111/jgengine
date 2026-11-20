/** How a scenario did across many seeds. */
export interface SeedSweep {
  /** Share of seeds the scenario held for, 0-1. */
  rate: number;
  /** Seeds it failed on, to replay one by hand. */
  failed: readonly string[];
}

/**
 * Run a seeded scenario once per seed (`sweep:0`, `sweep:1`, …) and report the share it held for. A test of
 * anything random asserts this rate instead of one seed's outcome, so it can't pass on one lucky run or
 * fail on one unlucky one: `expect(acrossSeeds(40, (seed) => carminesRetake(seed)).rate).toBeGreaterThan(0.8)`.
 *
 * @capability seed-sweep test a random system by its odds across many seeds, not one lucky run
 */
export function acrossSeeds(count: number, scenario: (seed: string) => boolean, prefix = "sweep"): SeedSweep {
  const runs = Math.max(1, Math.floor(count));
  const failed: string[] = [];
  for (let index = 0; index < runs; index += 1) {
    const seed = `${prefix}:${index}`;
    if (!scenario(seed)) failed.push(seed);
  }
  return { rate: (runs - failed.length) / runs, failed };
}
