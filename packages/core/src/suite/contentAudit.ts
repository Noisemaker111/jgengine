import type { RecipeDef } from "@jgengine/core/crafting/recipe";
import { validateContentProgression, type ContentProgressionRule } from "@jgengine/core/game/contentValidation";

import type { SuiteDataResult } from "./gameSuite";

/** One item as the content check sees it. */
export interface SuiteContentItem {
  id: string;
  /** The item says it can be placed: a structure, station, container or bed. */
  placeable?: boolean;
  /** A weapon that fires: the ammo item ids it takes, or `"none"` when it needs none. Melee weapons leave it out. */
  ammo?: readonly string[] | "none";
}

/** One way items get used: a recipe's inputs, eating, equipping, feeding a creature, a summon offering. */
export interface SuiteContentUse {
  id: string;
  /** Where it is defined, for the report. */
  path: string;
  items: readonly string[];
}

/** One unlock on the game's progression axis (a level, a wave, a chapter, money). */
export interface SuiteUnlock {
  /** The fact it provides, usually the recipe or option it opens. */
  id: string;
  at: number;
}

/**
 * The game's content as the generic check reads it, built from the game's own catalogs (its items,
 * recipes, drops, harvest tables, placement catalog and unlock levels) so the check sees what the game
 * runs on. Facts are opaque strings: an item id, `placed:<id>` once an item can be placed, an unlock id.
 */
export interface SuiteContent {
  items: readonly SuiteContentItem[];
  /** Facts the player has at the start. */
  start: readonly string[];
  /** Every way to get something: a recipe, a drop, a harvest, a vendor, spoiling. */
  sources: readonly ContentProgressionRule[];
  uses: readonly SuiteContentUse[];
  /** Item ids the game's placement catalog can place. Each gives the fact `placed:<id>`. */
  places: readonly string[];
  /** The progression axis and what unlocks along it, for the runway check. Unlocks at or under the cap are reachable facts. */
  runway?: { axis: string; cap: number; unlocks: readonly SuiteUnlock[]; maxGap?: number };
}

/** The fact a placed item gives, which a station recipe requires. */
export const placedFact = (id: string): string => `placed:${id}`;

/**
 * Sources and uses from engine recipes: each recipe needs its inputs, its station placed and its unlocks,
 * and gives its outputs; its inputs are uses.
 *
 * @capability suite-recipe-content turn engine recipes into the game suite's content sources and uses
 */
export function recipeContent(recipes: readonly RecipeDef[], path = "recipes"): { sources: ContentProgressionRule[]; uses: SuiteContentUse[] } {
  return {
    sources: recipes.map((recipe) => ({
      id: `recipe:${recipe.id}`,
      path: `${path}/${recipe.id}`,
      requires: [...recipe.inputs.map((input) => input.itemId), ...(recipe.station === undefined ? [] : [placedFact(recipe.station)]), ...(recipe.requires ?? [])],
      provides: recipe.outputs.map((output) => output.itemId),
    })),
    uses: recipes.filter((recipe) => recipe.inputs.length > 0).map((recipe) => ({ id: `recipe:${recipe.id}`, path: `${path}/${recipe.id}`, items: recipe.inputs.map((input) => input.itemId) })),
  };
}

const MAX_LISTED = 12;

function listed(ids: readonly string[]): string {
  return ids.length <= MAX_LISTED ? ids.join(", ") : `${ids.slice(0, MAX_LISTED).join(", ")} and ${ids.length - MAX_LISTED} more`;
}

/**
 * The generic content check behind the suite's data entries: every item has a source and a use, every
 * source is usable, every placeable item places, every firing weapon has obtainable ammo, and unlocks run
 * steadily to the progression cap. Builds on {@link validateContentProgression} as a closed world.
 *
 * @capability suite-content-audit prove the game suite's data entries (item sources and uses, placeables, ammo, unlock runway) from a game's content
 */
export function auditSuiteContent(content: SuiteContent): SuiteDataResult[] {
  const itemIds = new Set(content.items.map((item) => item.id));
  const placeable = new Set(content.places);
  const runway = content.runway;
  const unlockRules: ContentProgressionRule[] = (runway?.unlocks ?? []).filter((unlock) => unlock.at <= (runway?.cap ?? Infinity)).map((unlock) => ({ id: `unlock:${unlock.id}`, path: `runway/${unlock.id}`, requires: [], provides: [unlock.id] }));
  const placeRules: ContentProgressionRule[] = content.places.map((id) => ({ id: `place:${id}`, path: `places/${id}`, requires: [id], provides: [placedFact(id)] }));
  const progression = validateContentProgression({
    initial: content.start,
    rules: [...content.sources, ...placeRules, ...unlockRules],
    required: content.items.map((item) => ({ id: item.id, path: `items/${item.id}`, contentId: item.id })),
    closedWorld: true,
  });
  const reachable = new Set(progression.reachable);
  const result = (id: string, problems: string[]): SuiteDataResult => ({ id, ok: problems.length === 0, problems });

  const unsourced = content.items.filter((item) => !reachable.has(item.id)).map((item) => item.id);
  const sourceIds = new Set(content.sources.map((source) => source.id));
  const blocked = progression.issues.filter((issue) => issue.code === "blocked-rule" && issue.contentId !== undefined && sourceIds.has(issue.contentId)).map((issue) => issue.message);
  const used = new Set([...content.uses.flatMap((use) => use.items), ...content.places, ...content.items.flatMap((item) => (Array.isArray(item.ammo) ? item.ammo : []))]);
  const useless = content.items.filter((item) => !used.has(item.id)).map((item) => item.id);
  const unplaceable = content.items.filter((item) => item.placeable === true && !placeable.has(item.id)).map((item) => item.id);
  const ammoProblems: string[] = [];
  for (const item of content.items) {
    if (item.ammo === undefined || item.ammo === "none") continue;
    if (item.ammo.length === 0) ammoProblems.push(`${item.id} fires but takes no ammo`);
    for (const ammo of item.ammo) {
      if (!itemIds.has(ammo)) ammoProblems.push(`${item.id} takes unknown ammo ${ammo}`);
      else if (!reachable.has(ammo)) ammoProblems.push(`${item.id}'s ammo ${ammo} has no source`);
    }
  }

  return [
    result("content.item-source", unsourced.length === 0 ? [] : [`no source for ${listed(unsourced)}`]),
    result("content.item-use", useless.length === 0 ? [] : [`no use for ${listed(useless)}`]),
    result("content.recipes-reachable", blocked.slice(0, MAX_LISTED)),
    result("content.placeables-place", unplaceable.length === 0 ? [] : [`says it places but the placement catalog has none: ${listed(unplaceable)}`]),
    result("content.weapons-have-ammo", ammoProblems),
    result("progression.runway", runwayProblems(runway)),
  ];
}

function runwayProblems(runway: SuiteContent["runway"]): string[] {
  if (runway === undefined) return ["the content sheet declares no runway (its progression axis and unlocks)"];
  const maxGap = runway.maxGap ?? Math.max(2, Math.ceil(runway.cap / 10));
  const points = [...new Set(runway.unlocks.map((unlock) => unlock.at).filter((at) => at <= runway.cap))].sort((a, b) => a - b);
  if (points.length === 0) return [`nothing unlocks on ${runway.axis} up to its cap of ${runway.cap}`];
  const problems: string[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1] ?? 0;
    const to = points[index] ?? 0;
    if (to - from > maxGap) problems.push(`nothing unlocks between ${runway.axis} ${from} and ${to}`);
  }
  const last = points[points.length - 1] ?? 0;
  if (runway.cap - last > maxGap) problems.push(`the last unlock is at ${runway.axis} ${last} of a cap of ${runway.cap}`);
  return problems;
}
