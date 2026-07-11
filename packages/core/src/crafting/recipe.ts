import type { Vec2 } from "../world/geometry";
import type { InventoryLayout, InventoryState, ItemTraits } from "../inventory/inventoryModel";
import { countItem, putItem, takeItem } from "../inventory/inventoryModel";

export interface RecipeItem {
  itemId: string;
  count: number;
}

export interface RecipeDef {
  id: string;
  inputs: readonly RecipeItem[];
  outputs: readonly RecipeItem[];
  seconds?: number;
  station?: string;
  stationRange?: number;
  requires?: readonly string[];
  category?: string;
}

export interface StationInstance {
  catalogId: string;
  position: Vec2;
}

export interface CraftContext {
  origin?: Vec2;
  stations?: readonly StationInstance[];
  unlocked?: (id: string) => boolean;
}

export type CraftRejection =
  | { reason: "missing-inputs"; missing: readonly RecipeItem[] }
  | { reason: "no-station"; station: string }
  | { reason: "locked"; requires: readonly string[] }
  | { reason: "no-output-space" };

export type CraftCheck = { ok: true } | ({ ok: false } & CraftRejection);

export type CraftResult = { status: "ok"; state: InventoryState } | ({ status: "rejected" } & CraftRejection);

export function craftSeconds(recipe: RecipeDef): number {
  return recipe.seconds !== undefined && recipe.seconds > 0 ? recipe.seconds : 0;
}

export function missingInputs(state: InventoryState, recipe: RecipeDef): RecipeItem[] {
  const missing: RecipeItem[] = [];
  for (const input of recipe.inputs) {
    const have = countItem(state, input.itemId);
    if (have < input.count) missing.push({ itemId: input.itemId, count: input.count - have });
  }
  return missing;
}

export function hasRecipeInputs(state: InventoryState, recipe: RecipeDef): boolean {
  return missingInputs(state, recipe).length === 0;
}

export function stationSatisfied(recipe: RecipeDef, context: CraftContext): boolean {
  if (recipe.station === undefined) return true;
  const range = recipe.stationRange !== undefined && recipe.stationRange > 0 ? recipe.stationRange : Infinity;
  const origin = context.origin;
  if (range !== Infinity && origin === undefined) {
    throw new Error(
      `recipe "${recipe.id}" sets stationRange=${recipe.stationRange} but CraftContext.origin is missing`,
    );
  }
  const stations = context.stations ?? [];
  for (const station of stations) {
    if (station.catalogId !== recipe.station) continue;
    if (range === Infinity || origin === undefined) return true;
    const dx = station.position[0] - origin[0];
    const dz = station.position[1] - origin[1];
    if (dx * dx + dz * dz <= range * range) return true;
  }
  return false;
}

function lockedRequirements(recipe: RecipeDef, context: CraftContext): readonly string[] {
  if (recipe.requires === undefined || recipe.requires.length === 0) return [];
  const unlocked = context.unlocked;
  if (unlocked === undefined) return recipe.requires;
  return recipe.requires.filter((id) => !unlocked(id));
}

function outputsFit(state: InventoryState, layout: InventoryLayout, traits: ItemTraits, recipe: RecipeDef): boolean {
  let projected = state;
  for (const output of recipe.outputs) {
    const put = putItem(projected, layout, traits, output.itemId, output.count);
    if (put.status !== "ok") return false;
    projected = put.state;
  }
  return true;
}

function consumedState(state: InventoryState, recipe: RecipeDef): InventoryState {
  let projected = state;
  for (const input of recipe.inputs) {
    const take = takeItem(projected, input.itemId, input.count);
    if (take.status === "ok") projected = take.state;
  }
  return projected;
}

export function canCraft(
  state: InventoryState,
  layout: InventoryLayout,
  traits: ItemTraits,
  recipe: RecipeDef,
  context: CraftContext = {},
): CraftCheck {
  const locked = lockedRequirements(recipe, context);
  if (locked.length > 0) return { ok: false, reason: "locked", requires: locked };
  if (!stationSatisfied(recipe, context)) return { ok: false, reason: "no-station", station: recipe.station! };
  const missing = missingInputs(state, recipe);
  if (missing.length > 0) return { ok: false, reason: "missing-inputs", missing };
  if (!outputsFit(consumedState(state, recipe), layout, traits, recipe)) return { ok: false, reason: "no-output-space" };
  return { ok: true };
}

export function craft(
  state: InventoryState,
  layout: InventoryLayout,
  traits: ItemTraits,
  recipe: RecipeDef,
  context: CraftContext = {},
): CraftResult {
  const check = canCraft(state, layout, traits, recipe, context);
  if (!check.ok) {
    const { ok: _ok, ...rejection } = check;
    return { status: "rejected", ...rejection };
  }
  let projected = consumedState(state, recipe);
  for (const output of recipe.outputs) {
    const put = putItem(projected, layout, traits, output.itemId, output.count);
    if (put.status !== "ok") return { status: "rejected", reason: "no-output-space" };
    projected = put.state;
  }
  return { status: "ok", state: projected };
}

export interface RecipeGraph {
  all(): readonly RecipeDef[];
  get(id: string): RecipeDef | null;
  producing(itemId: string): RecipeDef[];
  using(itemId: string): RecipeDef[];
  category(categoryId: string): RecipeDef[];
}

export function createRecipeGraph(defs: readonly RecipeDef[] = []): RecipeGraph {
  const byId = new Map<string, RecipeDef>();
  for (const def of defs) byId.set(def.id, def);
  return {
    all: () => defs,
    get: (id) => byId.get(id) ?? null,
    producing: (itemId) => defs.filter((r) => r.outputs.some((o) => o.itemId === itemId)),
    using: (itemId) => defs.filter((r) => r.inputs.some((i) => i.itemId === itemId)),
    category: (categoryId) => defs.filter((r) => r.category === categoryId),
  };
}
