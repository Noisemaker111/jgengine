import type { ContentIssue } from "../game/contentValidation";
import type { RecipeDef } from "./recipe";

/** Caller catalogs for native crafting references; omission leaves that namespace unchecked. */
export interface RecipeCatalogValidationOptions {
  hasReference?(kind: "item" | "station" | "unlock", id: string): boolean;
}

/**
 * Validate native recipes before registration: ids, counts, timing and caller-catalog references.
 * Empty outputs are valid for game-owned benefits; fractional and zero counts are allowed.
 * Negative/nonfinite counts, durations and ranges reject. Duplicate input rows reject because the
 * crafting input check does not aggregate them; consolidate their counts into one row.
 * No price, scarcity, story or cycle policy is imposed. O(recipes + item rows + requirements).
 *
 * @capability recipe-catalog-validation locate broken crafting item/station/unlock references, duplicate inputs and invalid authored quantities with repair guidance
 */
export function validateRecipeCatalog(
  recipes: readonly RecipeDef[],
  options: RecipeCatalogValidationOptions = {},
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < recipes.length; index++) {
    const recipe = recipes[index]!;
    const path = `/${index}`;
    const add = (code: string, field: string, message: string, repair: string, referenceId?: string): void => {
      issues.push({ code, severity: "error", path: `${path}/${field}`, contentId: recipe.id,
        ...(referenceId === undefined ? {} : { referenceId }), message, repair });
    };
    const reference = (kind: "item" | "station" | "unlock", id: string, field: string): void => {
      if (options.hasReference?.(kind, id) === false) {
        add("unknown-reference", field, `Recipe "${recipe.id}" references unknown ${kind} "${id}".`,
          `Correct this reference or declare "${id}" in the ${kind} catalog.`, id);
      }
    };
    if (ids.has(recipe.id)) add("duplicate-recipe", "id", `Recipe id "${recipe.id}" repeats.`,
      "Give recipes distinct ids and update their references, or remove the duplicate.", recipe.id);
    ids.add(recipe.id);
    for (const direction of ["inputs", "outputs"] as const) {
      const inputs = new Set<string>();
      for (let row = 0; row < recipe[direction].length; row++) {
        const item = recipe[direction][row]!;
        const field = `${direction}/${row}`;
        reference("item", item.itemId, `${field}/itemId`);
        if (!Number.isFinite(item.count) || item.count < 0) {
          add("invalid-count", `${field}/count`, "Recipe count must be finite and nonnegative.",
            "Use a finite nonnegative count; enforce any stricter discrete-unit policy in the game.");
        }
        if (direction === "inputs" && inputs.has(item.itemId)) {
          add("duplicate-input", `${field}/itemId`, `Recipe "${recipe.id}" repeats input "${item.itemId}".`,
            "Combine this item's input counts into one row so the crafting check sees the total.", item.itemId);
        }
        inputs.add(item.itemId);
      }
    }
    if (recipe.station !== undefined) reference("station", recipe.station, "station");
    for (const [row, id] of (recipe.requires ?? []).entries()) reference("unlock", id, `requires/${row}`);
    for (const field of ["seconds", "stationRange"] as const) {
      const value = recipe[field];
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        add("invalid-number", field, `Recipe ${field} must be finite and nonnegative.`,
          "Use a finite nonnegative value, or omit the optional field.");
      }
    }
  }
  return issues;
}
