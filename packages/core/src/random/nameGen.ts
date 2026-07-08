export interface SyllableBank {
  onset?: readonly string[];
  nucleus: readonly string[];
  coda?: readonly string[];
}

export interface NameGeneratorOptions {
  rng: () => number;
  syllables: SyllableBank;
  minSyllables?: number;
  maxSyllables?: number;
  capitalize?: boolean;
}

export interface NameGenerator {
  name(): string;
}

export function pickFrom(rng: () => number, bank: readonly string[]): string {
  if (bank.length === 0) throw new Error("pickFrom: bank must not be empty");
  return bank[Math.floor(rng() * bank.length)]!;
}

export function createNameGenerator(options: NameGeneratorOptions): NameGenerator {
  const { rng, syllables } = options;
  const minSyllables = Math.max(1, options.minSyllables ?? 2);
  const maxSyllables = Math.max(minSyllables, options.maxSyllables ?? minSyllables);
  const capitalize = options.capitalize ?? true;

  function syllable(): string {
    const onset = syllables.onset === undefined || syllables.onset.length === 0 ? "" : pickFrom(rng, syllables.onset);
    const nucleus = pickFrom(rng, syllables.nucleus);
    const coda = syllables.coda === undefined || syllables.coda.length === 0 ? "" : pickFrom(rng, syllables.coda);
    return `${onset}${nucleus}${coda}`;
  }

  return {
    name() {
      const span = maxSyllables - minSyllables;
      const count = minSyllables + (span === 0 ? 0 : Math.floor(rng() * (span + 1)));
      let result = "";
      for (let i = 0; i < count; i++) result += syllable();
      return capitalize && result.length > 0 ? result.charAt(0).toUpperCase() + result.slice(1) : result;
    },
  };
}

export function fillTemplate(
  template: string,
  vars: Record<string, () => string> | Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in vars)) return match;
    const value = (vars as Record<string, string | (() => string)>)[key]!;
    return typeof value === "function" ? value() : value;
  });
}
