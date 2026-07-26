/**
 * Binds the part slots `world/buildings` generates to real models, so a procedural building renders
 * as an instanced asset kit instead of untextured blocks. Pure serializable data — core resolves
 * bindings, the renderer loads them.
 */
import type { BuildingKitSlot, BuildingPartKind, BuildingVariantCounts, Vec3 } from "./buildings";

/**
 * How a kit model's native bounds are mapped onto the slot box `BuildingPartPlacement.scale`
 * describes.
 *
 * - `stretch` — non-uniform scale to exactly fill the slot on all three axes. Right for tiling
 *   panels (walls, shutters) whose art is meant to fill its bay.
 * - `contain` — uniform scale so the model fits entirely inside the slot. Right for props that
 *   must not distort (AC units, chimneys, roof clutter).
 * - `cover` — uniform scale so the model covers the slot on its widest axis; may overhang.
 * - `native` — no fit scaling; the model's authored size is used as-is.
 */
export type BuildingKitFit = "stretch" | "contain" | "cover" | "native";

/**
 * One bindable variant for a building part slot. `model` is an opaque reference the host resolves
 * (an asset id, a pack-relative path, or a URL) — core never loads anything.
 *
 * Adjustments apply in slot-local space after `fit`: `x` runs along the facade, `y` is up, `z`
 * points outward from the wall.
 */
export interface BuildingKitPart {
  model: string;
  fit?: BuildingKitFit;
  offset?: Vec3;
  /** Euler XYZ in radians, applied on top of the slot's facade rotation. */
  rotation?: Vec3;
  /** Multiplier applied after `fit`. */
  scale?: Vec3;
  tint?: string;
  /**
   * Quarter-turn the model when its long horizontal axis disagrees with the slot's, so a panel
   * authored running along Z still tiles a bay that runs along X. Default true — modular kits do not
   * agree on a facing convention, and a stretched panel that is 90° off is always wrong. Set false
   * when a model's authored orientation is deliberate.
   */
  autoOrient?: boolean;
}

/**
 * Binds a building's generated part slots to models. A kit is plain serializable data — scene
 * documents can carry one — and is deliberately unopinionated about art direction: the engine ships
 * the seam, games ship the bindings.
 */
export interface BuildingKit {
  id: string;
  /** Variants per part kind; `BuildingKitSlot.variant` indexes this list, wrapping. */
  parts: Readonly<Partial<Record<BuildingPartKind, readonly BuildingKitPart[]>>>;
  /** Overrides keyed by `BuildingKitSlot.key` (`${facade}.${kind}`); beats `parts` for that facade. */
  slots?: Readonly<Record<string, readonly BuildingKitPart[]>>;
  /** Kinds this kit deliberately drops — no mesh, and no box fallback either. */
  omit?: readonly BuildingPartKind[];
  /** Fit for parts that do not set their own. Defaults to `stretch`. */
  fit?: BuildingKitFit;
}

/** A variant as authored: a bare model reference, or the full {@link BuildingKitPart} when it needs fit or transform tuning. */
export type BuildingKitPartInput = string | BuildingKitPart;

/** The authoring shape {@link defineBuildingKit} normalizes into a {@link BuildingKit}. */
export interface BuildingKitInput {
  id?: string;
  parts: Readonly<Partial<Record<BuildingPartKind, readonly BuildingKitPartInput[]>>>;
  slots?: Readonly<Record<string, readonly BuildingKitPartInput[]>>;
  omit?: readonly BuildingPartKind[];
  fit?: BuildingKitFit;
}

/**
 * What a renderer should do with one generated part.
 *
 * `model` carries a resolved variant with its fit already defaulted; `box` means fall back to the
 * engine's untextured block; `omit` means draw nothing.
 */
export type BuildingKitBinding =
  | { readonly type: "model"; readonly part: BuildingKitPart; readonly fit: BuildingKitFit }
  | { readonly type: "box" }
  | { readonly type: "omit" };

const BOX: BuildingKitBinding = { type: "box" };
const OMIT: BuildingKitBinding = { type: "omit" };

const DEFAULT_FIT: BuildingKitFit = "stretch";

function normalizePart(input: BuildingKitPartInput, where: string): BuildingKitPart {
  const part = typeof input === "string" ? { model: input } : input;
  if (typeof part.model !== "string" || part.model.length === 0) {
    throw new Error(`Building kit ${where} has a variant with no model reference.`);
  }
  return part;
}

function normalizeList(
  list: readonly BuildingKitPartInput[],
  where: string,
): readonly BuildingKitPart[] {
  if (list.length === 0) {
    throw new Error(
      `Building kit ${where} binds an empty variant list. Bind at least one model, or add the kind to \`omit\` to drop it.`,
    );
  }
  return list.map((entry) => normalizePart(entry, where));
}

/**
 * Validates and normalizes a kit description, accepting bare model strings as single-field variants.
 * Throws on empty variant lists so a typo fails at authoring time rather than silently falling back
 * to untextured boxes.
 *
 * @capability building-kit bind generated facade part slots to real models instead of untextured blocks
 */
export function defineBuildingKit(input: BuildingKitInput): BuildingKit {
  const parts: Partial<Record<BuildingPartKind, readonly BuildingKitPart[]>> = {};
  for (const [kind, list] of Object.entries(input.parts)) {
    if (list === undefined) continue;
    parts[kind as BuildingPartKind] = normalizeList(list, `"${input.id ?? "kit"}" part "${kind}"`);
  }
  const kit: BuildingKit = {
    id: input.id ?? "building-kit",
    parts,
    ...(input.omit === undefined ? {} : { omit: input.omit }),
    ...(input.fit === undefined ? {} : { fit: input.fit }),
  };
  if (input.slots === undefined) return kit;
  const slots: Record<string, readonly BuildingKitPart[]> = {};
  for (const [key, list] of Object.entries(input.slots)) {
    slots[key] = normalizeList(list, `"${kit.id}" slot "${key}"`);
  }
  return { ...kit, slots };
}

function variantsFor(
  kit: BuildingKit,
  kind: BuildingPartKind,
  slotKey: string | undefined,
): readonly BuildingKitPart[] | undefined {
  if (slotKey !== undefined) {
    const override = kit.slots?.[slotKey];
    if (override !== undefined) return override;
  }
  return kit.parts[kind];
}

/**
 * Resolves one generated part against a kit. Pass the placement's `kind` and its `kit` slot; the
 * slot's `variant` wraps around the bound list, so a kit may carry any number of variants
 * independent of the generator's `variants` counts.
 *
 * Returns `box` when the kind is unbound — the renderer keeps drawing today's block, so a partial
 * kit is a valid kit.
 *
 * @capability building-kit resolve one generated part to its bound model, a block fallback, or nothing
 */
export function resolveBuildingKitPart(
  kit: BuildingKit | undefined,
  kind: BuildingPartKind,
  slot?: BuildingKitSlot,
): BuildingKitBinding {
  if (kit === undefined) return BOX;
  if (kit.omit?.includes(kind) === true) return OMIT;
  const variants = variantsFor(kit, kind, slot?.key);
  if (variants === undefined || variants.length === 0) return BOX;
  const index = slot === undefined ? 0 : Math.abs(Math.trunc(slot.variant)) % variants.length;
  const part = variants[index] as BuildingKitPart;
  return { type: "model", part, fit: part.fit ?? kit.fit ?? DEFAULT_FIT };
}

/**
 * The variant counts a kit actually supplies, shaped for `BuildingConfigInput.variants`. Feed this
 * into `generateBuilding` so seeded picks spread across exactly the models the kit binds instead of
 * indexing past them and wrapping unevenly.
 *
 * @capability building-kit bind generated facade part slots to real models instead of untextured blocks
 */
export function buildingKitVariantCounts(kit: BuildingKit): Partial<BuildingVariantCounts> {
  const counts: Partial<BuildingVariantCounts> = {};
  for (const [kind, list] of Object.entries(kit.parts)) {
    if (list === undefined || list.length === 0) continue;
    // `roof`, `guardrail`, and `corner` have no variant knob on BuildingVariantCounts.
    if (kind === "roof" || kind === "guardrail" || kind === "corner") continue;
    counts[kind as keyof BuildingVariantCounts] = list.length;
  }
  return counts;
}
