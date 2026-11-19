// @skill jgengine-gameplay
import { defineGenerator, type GeneratorDefinition } from "../generator/generator";
import { registerGeneratorText } from "../generator/generatorText";
import { defineParamSchema, type ParamsOf } from "../generator/paramSchema";

export interface SyllableBank {
  onset?: readonly string[];
  nucleus: readonly string[];
  coda?: readonly string[];
}

export const NAMES_OUTPUT = "names";

export const MAX_NAMES_PER_ROLL = 64;

const MAX_SYLLABLES = 8;

export interface NameGeneratorDefaults {
  count?: number;
  minSyllables?: number;
  maxSyllables?: number;
  capitalize?: boolean;
  template?: string;
}

export interface NameGeneratorSpec {
  id: string;
  label: string;
  syllables: SyllableBank;
  defaults?: NameGeneratorDefaults;
}

function nameSchema(defaults: NameGeneratorDefaults) {
  const minSyllables = Math.max(1, Math.min(MAX_SYLLABLES, Math.round(defaults.minSyllables ?? 2)));
  const maxSyllables = Math.max(minSyllables, Math.min(MAX_SYLLABLES, Math.round(defaults.maxSyllables ?? minSyllables)));
  return defineParamSchema({
    fields: [
      { type: "range", key: "count", label: "names", min: 1, max: MAX_NAMES_PER_ROLL, step: 1, default: Math.max(1, Math.min(MAX_NAMES_PER_ROLL, Math.round(defaults.count ?? 8))), vary: false },
      { type: "range", key: "minSyllables", label: "min syllables", min: 1, max: MAX_SYLLABLES, step: 1, default: minSyllables },
      { type: "range", key: "maxSyllables", label: "max syllables", min: 1, max: MAX_SYLLABLES, step: 1, default: maxSyllables },
      { type: "bool", key: "capitalize", label: "capitalize", default: defaults.capitalize ?? true },
      { type: "text", key: "template", label: "template", default: defaults.template ?? "{name}" },
      { type: "seed", key: "seed", label: "seed", default: "" },
    ],
  });
}

export type NameGeneratorParams = ParamsOf<ReturnType<typeof nameSchema>>;

export type NameGeneratorDefinition = GeneratorDefinition<ReturnType<typeof nameSchema>, string[]>;

function pickFrom(rng: () => number, bank: readonly string[]): string {
  return bank[Math.min(bank.length - 1, Math.floor(rng() * bank.length))]!;
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

/**
 * Declare a seeded name generator over a game's syllable bank. Its `generate` draws every name from
 * the context's default stream in order, so the first N names of a longer roll are the same N names.
 * Register it with `registerGenerator` to list it in the editor and to agents.
 *
 * @capability name-generator generate procedural names from templates and word banks
 */
export function defineNameGenerator(spec: NameGeneratorSpec): NameGeneratorDefinition {
  const { syllables } = spec;
  if (syllables.nucleus.length === 0) throw new RangeError(`Name generator "${spec.id}" needs at least one nucleus`);
  const onsets = syllables.onset ?? [];
  const codas = syllables.coda ?? [];
  return defineGenerator({
    id: spec.id,
    label: spec.label,
    output: NAMES_OUTPUT,
    schema: nameSchema(spec.defaults ?? {}),
    generate(params, context): string[] {
      const rng = context.random();
      const minSyllables = params.minSyllables;
      const maxSyllables = Math.max(minSyllables, params.maxSyllables);
      const syllable = (): string => {
        const onset = onsets.length === 0 ? "" : pickFrom(rng, onsets);
        const nucleus = pickFrom(rng, syllables.nucleus);
        const coda = codas.length === 0 ? "" : pickFrom(rng, codas);
        return `${onset}${nucleus}${coda}`;
      };
      const name = (): string => {
        const span = maxSyllables - minSyllables;
        const count = minSyllables + (span === 0 ? 0 : Math.floor(rng() * (span + 1)));
        let result = "";
        for (let i = 0; i < count; i++) result += syllable();
        return params.capitalize && result.length > 0 ? result.charAt(0).toUpperCase() + result.slice(1) : result;
      };
      return Array.from({ length: params.count }, () => fillTemplate(params.template, { name }));
    },
  });
}

/** @internal */
export function registerNameGeneratorText(): void {
  registerGeneratorText(NAMES_OUTPUT, (output) => (Array.isArray(output) ? output.filter((name): name is string => typeof name === "string") : []));
}
