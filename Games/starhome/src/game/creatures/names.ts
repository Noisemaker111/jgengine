import { createNameGenerator } from "@jgengine/core/random/nameGen";

const SYLLABLES = {
  onset: ["Zy", "Qu", "Vor", "Nix", "Bl", "Thra", "Om", "Ky", "Ael", "Ss", "Dru", "Xa"],
  nucleus: ["a", "ee", "o", "ii", "u", "ae", "y", "oo"],
  coda: ["x", "n", "th", "l", "sh", "rr", "k", "ph", ""],
} as const;

export function makeNamer(seed: string): () => string {
  let a = 0;
  for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) >>> 0;
  const rng = () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
    t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  const gen = createNameGenerator({ rng, syllables: SYLLABLES, minSyllables: 2, maxSyllables: 3 });
  return () => gen.name();
}
