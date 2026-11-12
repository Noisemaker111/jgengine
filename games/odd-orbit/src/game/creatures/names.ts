import { registerGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { defineNameGenerator } from "@jgengine/core/random/nameGen";

const SYLLABLES = {
  onset: ["Zy", "Qu", "Vor", "Nix", "Bl", "Thra", "Om", "Ky", "Ael", "Ss", "Dru", "Xa"],
  nucleus: ["a", "ee", "o", "ii", "u", "ae", "y", "oo"],
  coda: ["x", "n", "th", "l", "sh", "rr", "k", "ph", ""],
} as const;

/** Odd Orbit's alien names: two or three syllables from the colony's own bank. */
export const ALIEN_NAMES = defineNameGenerator({
  id: "odd-orbit.alien-names",
  label: "Odd Orbit alien names",
  syllables: SYLLABLES,
  defaults: { minSyllables: 2, maxSyllables: 3 },
});
registerGenerator(ALIEN_NAMES);

/** The first `count` alien names a colony seed rolls; the same seed always names the same colony. */
export function alienNames(seed: string, count: number): string[] {
  return runGenerator(ALIEN_NAMES, { seed, count }, { fallbackSeed: seed });
}
