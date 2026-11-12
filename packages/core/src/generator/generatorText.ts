// @skill jgengine-world
/**
 * Text previews for generator output families that have no 3D form (name sets, loot rolls, item
 * rolls). A family registers one function from an output to a few short lines; the variant grid
 * prints those lines in each tile and the `generator_variants` verb returns them with each variant,
 * so an agent can read 20 rolled name sets or loot tables from one call.
 *
 * @capability generator-contract seeded, schema-driven procedural generator with variants and editor exposure
 */
import { generatorContext, type GeneratorDefinition, type GeneratorVariant } from "./generator";

/** One output as a few short lines of text, most telling first. */
export type GeneratorTextPreview = (output: unknown) => readonly string[];

const textPreviews = new Map<string, GeneratorTextPreview>();

/** Register the text preview for a generator output family (`"names"`, `"loot-items"`, …). Replaces an earlier one. */
export function registerGeneratorText(output: string, preview: GeneratorTextPreview): void {
  textPreviews.set(output, preview);
}

/** The text preview registered for an output family, or undefined when that family has none. */
export function getGeneratorText(output: string): GeneratorTextPreview | undefined {
  return textPreviews.get(output);
}

/**
 * One variant's output as text lines, or undefined when its family registers no text preview.
 * `definition` is the untyped (registered) form, so the variant's params are parsed on the way in.
 * Params a catalog cannot roll (a pinned base above the item level) read as one `no output:` line
 * instead of throwing, so one bad variant does not blank the grid.
 */
export function generatorVariantText(definition: GeneratorDefinition, variant: Pick<GeneratorVariant, "seed" | "params">): readonly string[] | undefined {
  const preview = textPreviews.get(definition.output);
  if (preview === undefined) return undefined;
  try {
    return preview(definition.generate(variant.params, generatorContext(variant.seed)));
  } catch (error) {
    return [`no output: ${error instanceof Error ? error.message : String(error)}`];
  }
}
