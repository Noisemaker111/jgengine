import { createNameGenerator } from "@jgengine/core/random/nameGen";
import { seededRng } from "@jgengine/core/random/rng";

const SYLLABLES = {
  onset: ["Zy", "Qu", "Vor", "Nix", "Bl", "Thra", "Om", "Ky", "Ael", "Ss", "Dru", "Xa"],
  nucleus: ["a", "ee", "o", "ii", "u", "ae", "y", "oo"],
  coda: ["x", "n", "th", "l", "sh", "rr", "k", "ph", ""],
} as const;

export function makeNamer(seed: string): () => string {
  const gen = createNameGenerator({ rng: seededRng(seed), syllables: SYLLABLES, minSyllables: 2, maxSyllables: 3 });
  return () => gen.name();
}
