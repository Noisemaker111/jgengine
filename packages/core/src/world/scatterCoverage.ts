/**
 * The shared "how much stuff grows here" contract for scatterable scene kinds
 * (`grass_field` / `scatter` / `city`). Every scatterable kind fills an authored AREA with instances
 * at a DENSITY, and every kind caps the placed count at a bounded BUDGET so a huge or dense request
 * can never generate unbounded work. Before this module each kind hand-rolled its own readout and
 * clamp story (grass silently capped in the renderer, scatter never capped, city had no budget note);
 * this is the one place that
 *
 * 1. names the per-kind unit noun + placement budget ({@link SCATTER_COVERAGE_SPECS}),
 * 2. turns an area + density into a `requested` / placed `count` / `capped` triple
 *    ({@link densityCoverage}, {@link placedCoverage}), and
 * 3. renders the identical clamp-and-warn clause the inspector surfaces —
 *    `requested N, capped at M (budget)` — via {@link budgetWarning} / {@link describeScatterCoverage}.
 *
 * Pure data + string helpers, no rendering. Each kind's `note` and the editor's shared
 * `CoverageSection` consume it, so grass, scatter, and city tell one coverage story.
 *
 * @capability scatter-coverage shared density/budget semantics for scatterable kinds
 */

/** The scatterable kinds that share the coverage contract. */
export type ScatterCoverageKind = "grass_field" | "scatter" | "city";

/**
 * Max blade/placement instances a single `grass_field` or `scatter` patch places. Mirrors the grass
 * renderer's instance-buffer ceiling; the scatter resolver truncates to it too, so a patch never
 * renders more than this many placements regardless of density × area.
 */
export const SCATTER_INSTANCE_BUDGET = 250_000;

/** Max buildings a single `city` district generates — the block/parcel pipeline's bounded lot cap. */
export const CITY_BUILDING_BUDGET = 2_600;

/** Per-kind coverage descriptor: the unit noun, whether density is per-m², and the placement budget. */
export interface ScatterCoverageSpec {
  kind: ScatterCoverageKind;
  /** Plural noun for one placed instance: `blades` | `placements` | `buildings`. */
  unit: string;
  /** Density is per-square-meter (grass/scatter). City fills by street fabric, not by a per-m² dial. */
  perArea: boolean;
  /** Hard cap on placed instances for one patch/district. */
  budget: number;
}

/** The coverage spec per scatterable kind — the single source for its unit + budget. */
export const SCATTER_COVERAGE_SPECS: Record<ScatterCoverageKind, ScatterCoverageSpec> = {
  grass_field: { kind: "grass_field", unit: "blades", perArea: true, budget: SCATTER_INSTANCE_BUDGET },
  scatter: { kind: "scatter", unit: "placements", perArea: true, budget: SCATTER_INSTANCE_BUDGET },
  city: { kind: "city", unit: "buildings", perArea: false, budget: CITY_BUILDING_BUDGET },
};

/** The coverage spec for a scatterable kind, or `null` when the kind is not scatterable. */
export function scatterCoverageSpec(kind: string): ScatterCoverageSpec | null {
  return (SCATTER_COVERAGE_SPECS as Record<string, ScatterCoverageSpec | undefined>)[kind] ?? null;
}

/**
 * A resolved coverage readout: how many instances an authored patch WANTS (`requested`, when it can
 * be computed cheaply from geometry × density), how many it will actually place after the budget
 * clamp (`count`), the `budget` ceiling, and whether the request hit it (`capped`). `requested` is
 * `null` for kinds whose pre-cap ask is not knowable without running the generator (city, where the
 * count comes from the resolved street fabric).
 */
export interface ScatterCoverage {
  kind: ScatterCoverageKind;
  unit: string;
  /** Footprint area in m² (0 when unknown / not applicable). */
  area: number;
  /** Instances the density asks for before the budget clamp; `null` when only the placed count is known. */
  requested: number | null;
  /** Instances actually placed: `min(requested, budget)`, or the generator's reported count. */
  count: number;
  budget: number;
  capped: boolean;
}

const nonNegative = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Footprint area (m²) of a scatterable object: a closed path polygon (shoelace), a volume box
 * (`halfExtents`), or a disc (`radius`). Structural so it accepts a `SceneKindObject`, an editor
 * volume, or a scatter path without a hard type dependency.
 */
export function scatterFootprintArea(object: {
  points?: readonly { x: number; z: number }[];
  halfExtents?: { x: number; z: number };
  radius?: number;
}): number {
  const points = object.points;
  if (points !== undefined && points.length >= 3) {
    let sum = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      sum += points[j]!.x * points[i]!.z - points[i]!.x * points[j]!.z;
    }
    return Math.abs(sum) / 2;
  }
  const he = object.halfExtents;
  if (he !== undefined) return nonNegative(Math.abs(he.x) * 2) * nonNegative(Math.abs(he.z) * 2);
  if (object.radius !== undefined) return Math.PI * nonNegative(object.radius) ** 2;
  return 0;
}

/**
 * Coverage for a per-m² kind (`grass_field` / `scatter`): `requested = floor(density × area)`, clamped
 * to the kind's budget. `capped` is true when the request exceeds the budget.
 */
export function densityCoverage(kind: "grass_field" | "scatter", area: number, density: number): ScatterCoverage {
  const spec = SCATTER_COVERAGE_SPECS[kind];
  const a = nonNegative(area);
  const requested = Math.floor(nonNegative(density) * a);
  const count = Math.min(requested, spec.budget);
  return { kind, unit: spec.unit, area: a, requested, count, budget: spec.budget, capped: requested > spec.budget };
}

/**
 * Coverage for a kind whose placed `count` is already known from its generator (city, from its
 * resolved lots). No pre-cap `requested` is available — the generator stops at the budget — so
 * `capped` is inferred from the placed count reaching the ceiling.
 */
export function placedCoverage(kind: ScatterCoverageKind, area: number, placed: number): ScatterCoverage {
  const spec = SCATTER_COVERAGE_SPECS[kind];
  const count = Math.max(0, Math.floor(nonNegative(placed)));
  return { kind, unit: spec.unit, area: nonNegative(area), requested: null, count, budget: spec.budget, capped: count >= spec.budget };
}

const fmt = (n: number): string => Math.round(n).toLocaleString();

/**
 * The shared clamp-and-warn clause every scatterable kind appends, worded identically: `""` when
 * under budget, else ` · requested N, capped at M (budget)` when the pre-cap ask is known, or
 * ` · capped at M (budget)` when only the ceiling is (city). This is the "surfaced, never silent"
 * budget signal from #1112.
 */
export function budgetWarning(coverage: ScatterCoverage): string {
  if (!coverage.capped) return "";
  if (coverage.requested !== null && coverage.requested > coverage.budget) {
    return ` · requested ${fmt(coverage.requested)}, capped at ${fmt(coverage.budget)} (budget)`;
  }
  return ` · capped at ${fmt(coverage.budget)} (budget)`;
}

/** The full one-line coverage readout: `≈ N unit · A m²` plus the {@link budgetWarning} when capped. */
export function describeScatterCoverage(coverage: ScatterCoverage): string {
  const head = `≈ ${fmt(coverage.count)} ${coverage.unit}`;
  const area = coverage.area > 0 ? ` · ${fmt(coverage.area)} m²` : "";
  return `${head}${area}${budgetWarning(coverage)}`;
}
