import type { Aabb, Footprint, Vec2 } from "../world/geometry";

/**
 * Asset-space metadata + placement rotation policy: the catalog-owned description of how a model sits
 * in its source space and how a placement tool may rotate it. Games author scenes against engine north
 * (heading `0` degrees, increasing clockwise) instead of transplanting per-game yaw offsets and magic
 * scales; the catalog entry ({@link "scene/assetCatalog".ModelAssetRef}) is the upstream owner of the
 * correction. Public APIs speak degrees; the only radians here are the private Three.js Y-rotation this
 * module converts to, matching `world/placementController`'s `quarterTurnsToRotationY` sign so a
 * quarter turn still equals 90 degrees clockwise. Pure and serializable — no three.js, no allocation of
 * shared state — so preview, placement, and runtime spawning share one interpretation.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const FULL_TURN = 360;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Wrap `degrees` into `[0, 360)` — the canonical heading range every policy and conversion here works
 * in. Non-finite input collapses to `0` so bad metadata never leaks a `NaN` heading downstream.
 * @capability asset-heading normalize a placement heading into the engine's degree convention
 */
export function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = degrees % FULL_TURN;
  return wrapped < 0 ? wrapped + FULL_TURN : wrapped;
}

function wrapRadians(radians: number): number {
  let r = radians % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r + 0; // normalize -0 to 0

}

/**
 * Convert a compass heading (degrees, `0` = engine north, increasing clockwise) into the Three.js
 * Y-rotation (radians, wrapped to `(-PI, PI]`) a renderer applies. Sign matches
 * `world/placementController.quarterTurnsToRotationY`, so heading `90` equals one clockwise quarter
 * turn. This is the one place degrees cross into the private radian space Three.js requires.
 * @capability asset-heading turn a north-relative degree heading into a Three.js Y-rotation
 */
export function headingToRotationY(headingDegrees: number): number {
  return wrapRadians(-normalizeDegrees(headingDegrees) * DEG2RAD);
}

/**
 * Inverse of {@link headingToRotationY}: recover the `[0, 360)` compass heading from a Three.js
 * Y-rotation. Lets a gizmo or inspector present radians as the degrees authors edit.
 * @capability asset-heading read a Three.js Y-rotation back as a north-relative degree heading
 */
export function rotationYToHeading(rotationY: number): number {
  return normalizeDegrees(-rotationY * RAD2DEG);
}

/** Bridge the legacy 0–3 quarter-turn placement model onto degrees (each turn is 90 degrees clockwise). @internal */
export function quarterTurnsToHeading(quarterTurns: number): number {
  return normalizeDegrees(Math.round(quarterTurns) * 90);
}

/**
 * A per-asset/per-tool rotation constraint, authored as data instead of hardcoded in build code:
 * `locked` pins every placement to one heading, `snap` quantizes to an increment (15, 45, …), and
 * `free` allows any heading. Serializable — this is the shape stored on a catalog entry or a tool.
 */
export type PlacementRotationPolicy =
  | { readonly mode: "locked"; readonly degrees?: number }
  | { readonly mode: "snap"; readonly snapDegrees: number }
  | { readonly mode: "free" };

/**
 * Quantize `degrees` to the nearest multiple of `increment` (both in the `[0, 360)` convention). A
 * non-positive increment is treated as free rotation and only normalizes. The math behind a
 * `snap`-mode {@link PlacementRotationPolicy}.
 * @capability placement-rotation snap a heading to a fixed degree increment
 */
export function snapHeading(degrees: number, increment: number): number {
  if (!(increment > 0)) return normalizeDegrees(degrees);
  return normalizeDegrees(Math.round(normalizeDegrees(degrees) / increment) * increment);
}

/**
 * Resolve a raw drag/scroll heading through a {@link PlacementRotationPolicy} into the heading a
 * placement should actually commit: `locked` ignores the input for its fixed heading, `snap` quantizes,
 * `free` (or an absent policy) normalizes. Deterministic — the single interpreter preview, editor
 * placement, and runtime spawning share instead of each re-implementing the modes.
 * @capability placement-rotation apply a rotation policy to a candidate placement heading
 */
export function applyRotationPolicy(degrees: number, policy: PlacementRotationPolicy | undefined): number {
  if (policy === undefined || policy.mode === "free") return normalizeDegrees(degrees);
  if (policy.mode === "locked") return normalizeDegrees(policy.degrees ?? 0);
  return snapHeading(degrees, policy.snapDegrees);
}

/**
 * Where a model's pivot sits within its footprint: `center` (origin at the footprint center),
 * `corner` (origin at the min-X/min-Z corner), or a normalized `{ x, z }` fraction in `[-0.5, 0.5]`.
 */
export type AssetAnchor = "center" | "corner" | { readonly x: number; readonly z: number };

/**
 * Catalog-level asset-space metadata: how a model is authored relative to the engine, owned by the
 * catalog entry rather than re-derived per game. Every field is optional so an unmeasured asset stays
 * valid; {@link resolveFacingRotationY}/{@link assetUnitScale}/{@link resolveAnchorOffset} supply the
 * documented defaults.
 */
export interface AssetSpace {
  /** Compass heading (degrees, `0` = north) the model's front visually points at `rotationY = 0`. Default `0`. */
  forwardDegrees?: number;
  /** Multiply source-space lengths by this to reach engine meters (a kit's native tile size correction). Default `1`. */
  unitScale?: number;
  /** Authored footprint in engine meters — the grid/placement extent, independent of the raw mesh bounds. */
  footprint?: Footprint;
  /** Authored grid cell size in engine meters this asset snaps to. */
  gridSize?: number;
  /** Where the model origin sits within {@link footprint}. Default `center`. */
  anchor?: AssetAnchor;
  /** Optional asset-local placement bounds (XZ) a tool clamps a drop position into. */
  bounds?: Aabb;
  /** Default rotation constraint when this asset is placed. Absent means free rotation. */
  rotation?: PlacementRotationPolicy;
}

/**
 * The Three.js Y-rotation that makes a model whose front is authored at `forwardDegrees` visually point
 * `headingDegrees` (engine north = `0`). This is the catalog-owned replacement for per-game corrective
 * yaw: a model authored facing south (`forwardDegrees: 180`) placed toward north resolves to `Math.PI`.
 * @capability asset-facing resolve a placement heading into a Three.js Y-rotation using canonical forward
 */
export function resolveFacingRotationY(
  headingDegrees: number,
  space?: Pick<AssetSpace, "forwardDegrees">,
): number {
  return headingToRotationY(headingDegrees - (space?.forwardDegrees ?? 0));
}

/** The effective, guarded unit scale for an asset — a finite positive `unitScale`, else `1`. @internal */
export function assetUnitScale(space?: Pick<AssetSpace, "unitScale">): number {
  const s = space?.unitScale;
  return typeof s === "number" && Number.isFinite(s) && s > 0 ? s : 1;
}

/**
 * Convert a source-space length to engine meters through the asset's {@link AssetSpace.unitScale} — the
 * data-owned replacement for per-game scale constants (a native ~4-unit kit tile down to a 1-unit grid).
 * @capability asset-units convert a source-space length to engine meters via catalog unit scale
 */
export function toEngineUnits(sourceValue: number, space?: Pick<AssetSpace, "unitScale">): number {
  return sourceValue * assetUnitScale(space);
}

/**
 * The pivot's offset from the footprint center, in engine meters, implied by {@link AssetSpace.anchor}
 * and {@link AssetSpace.footprint}. `center` yields `[0, 0]`; `corner` yields the min corner; a
 * normalized `{ x, z }` scales by the footprint. Subtract it to seat a footprint centered on a point.
 * @capability asset-anchor resolve a model's pivot offset from its footprint center
 */
export function resolveAnchorOffset(space?: Pick<AssetSpace, "anchor" | "footprint">): Vec2 {
  const w = space?.footprint?.w ?? 0;
  const d = space?.footprint?.d ?? 0;
  const anchor = space?.anchor ?? "center";
  let fx = 0;
  let fz = 0;
  if (anchor === "corner") {
    fx = -0.5;
    fz = -0.5;
  } else if (typeof anchor === "object") {
    fx = clamp(anchor.x, -0.5, 0.5);
    fz = clamp(anchor.z, -0.5, 0.5);
  }
  return [fx * w, fz * d];
}

/**
 * The axis-aligned footprint extent after rotating a rectangular {@link Footprint} by `headingDegrees`
 * — footprint-aware placement: a 90-degree turn swaps width/depth, and arbitrary headings grow the
 * bounding box so overlap and snap checks see the space the rotated asset truly occupies.
 * @capability asset-footprint rotate a rectangular footprint into its axis-aligned extent
 */
export function rotatedFootprint(footprint: Footprint, headingDegrees: number): Footprint {
  const rad = normalizeDegrees(headingDegrees) * DEG2RAD;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    w: footprint.w * cos + footprint.d * sin,
    d: footprint.w * sin + footprint.d * cos,
  };
}

/** One problem found by {@link validateAssetSpace}: which metadata field and why it is invalid. */
export interface AssetSpaceIssue {
  field: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateRotationPolicy(raw: unknown): AssetSpaceIssue[] {
  if (!isRecord(raw)) return [{ field: "mode", message: "expected an object" }];
  if (raw.mode === "free") return [];
  if (raw.mode === "locked") {
    return raw.degrees !== undefined && (typeof raw.degrees !== "number" || !Number.isFinite(raw.degrees))
      ? [{ field: "degrees", message: "expected a finite number" }]
      : [];
  }
  if (raw.mode === "snap") {
    return finitePositive(raw.snapDegrees) ? [] : [{ field: "snapDegrees", message: "expected a positive number" }];
  }
  return [{ field: "mode", message: "expected 'locked', 'snap', or 'free'" }];
}

/**
 * Report contradictory or malformed asset-space metadata so catalog generation can reject it before it
 * reaches a tool: non-finite headings, non-positive scales/sizes, inverted bounds, unknown anchors, and
 * ill-formed rotation policies (a `snap` with a non-positive increment, an unknown `mode`). An empty
 * array means valid. Validation lives here so tools consume resolved metadata instead of reinterpreting.
 * @capability asset-space validate catalog asset-space metadata during index generation
 */
export function validateAssetSpace(raw: unknown): AssetSpaceIssue[] {
  const issues: AssetSpaceIssue[] = [];
  if (!isRecord(raw)) {
    issues.push({ field: "", message: "expected an object" });
    return issues;
  }
  if (raw.forwardDegrees !== undefined && (typeof raw.forwardDegrees !== "number" || !Number.isFinite(raw.forwardDegrees))) {
    issues.push({ field: "forwardDegrees", message: "expected a finite number" });
  }
  if (raw.unitScale !== undefined && !finitePositive(raw.unitScale)) {
    issues.push({ field: "unitScale", message: "expected a positive number" });
  }
  if (raw.gridSize !== undefined && !finitePositive(raw.gridSize)) {
    issues.push({ field: "gridSize", message: "expected a positive number" });
  }
  if (raw.footprint !== undefined) {
    const fp = raw.footprint;
    if (!isRecord(fp) || !finitePositive(fp.w) || !finitePositive(fp.d)) {
      issues.push({ field: "footprint", message: "expected { w > 0, d > 0 }" });
    }
  }
  if (raw.anchor !== undefined) {
    const a = raw.anchor;
    const named = a === "center" || a === "corner";
    const explicit = isRecord(a) && typeof a.x === "number" && typeof a.z === "number";
    if (!named && !explicit) issues.push({ field: "anchor", message: "expected 'center', 'corner', or { x, z }" });
  }
  if (raw.bounds !== undefined) {
    const b = raw.bounds;
    if (!isRecord(b) || typeof b.minX !== "number" || typeof b.maxX !== "number" || typeof b.minZ !== "number" || typeof b.maxZ !== "number") {
      issues.push({ field: "bounds", message: "expected an Aabb" });
    } else if (b.maxX < b.minX || b.maxZ < b.minZ) {
      issues.push({ field: "bounds", message: "max must be >= min" });
    }
  }
  if (raw.rotation !== undefined) {
    issues.push(...validateRotationPolicy(raw.rotation).map((m) => ({ field: `rotation.${m.field}`, message: m.message })));
  }
  return issues;
}

/**
 * Parse an untrusted rotation policy (from a scene document or catalog JSON) into a valid
 * {@link PlacementRotationPolicy}, defaulting to `free` when absent or malformed. The lenient companion
 * to {@link validateAssetSpace} for the read path.
 * @capability placement-rotation parse a serialized rotation policy, defaulting to free
 */
export function parseRotationPolicy(raw: unknown): PlacementRotationPolicy {
  if (isRecord(raw)) {
    if (raw.mode === "locked") {
      return typeof raw.degrees === "number" && Number.isFinite(raw.degrees)
        ? { mode: "locked", degrees: normalizeDegrees(raw.degrees) }
        : { mode: "locked" };
    }
    if (raw.mode === "snap" && finitePositive(raw.snapDegrees)) return { mode: "snap", snapDegrees: raw.snapDegrees };
  }
  return { mode: "free" };
}

/**
 * Parse untrusted JSON into an {@link AssetSpace}, dropping malformed fields, or `undefined` when
 * nothing valid remains — the round-trippable read path for serialized catalog/scene metadata.
 * @capability asset-space parse serialized asset-space metadata into a validated shape
 */
export function parseAssetSpace(raw: unknown): AssetSpace | undefined {
  if (!isRecord(raw)) return undefined;
  const out: {
    forwardDegrees?: number;
    unitScale?: number;
    footprint?: Footprint;
    gridSize?: number;
    anchor?: AssetAnchor;
    bounds?: Aabb;
    rotation?: PlacementRotationPolicy;
  } = {};
  if (typeof raw.forwardDegrees === "number" && Number.isFinite(raw.forwardDegrees)) out.forwardDegrees = normalizeDegrees(raw.forwardDegrees);
  if (finitePositive(raw.unitScale)) out.unitScale = raw.unitScale;
  if (finitePositive(raw.gridSize)) out.gridSize = raw.gridSize;
  if (isRecord(raw.footprint) && finitePositive(raw.footprint.w) && finitePositive(raw.footprint.d)) {
    out.footprint = { w: raw.footprint.w, d: raw.footprint.d };
  }
  if (raw.anchor === "center" || raw.anchor === "corner") out.anchor = raw.anchor;
  else if (isRecord(raw.anchor) && typeof raw.anchor.x === "number" && typeof raw.anchor.z === "number") {
    out.anchor = { x: raw.anchor.x, z: raw.anchor.z };
  }
  if (isRecord(raw.bounds) && typeof raw.bounds.minX === "number" && typeof raw.bounds.maxX === "number" && typeof raw.bounds.minZ === "number" && typeof raw.bounds.maxZ === "number") {
    out.bounds = { minX: raw.bounds.minX, maxX: raw.bounds.maxX, minZ: raw.bounds.minZ, maxZ: raw.bounds.maxZ };
  }
  if (isRecord(raw.rotation)) out.rotation = parseRotationPolicy(raw.rotation);
  return Object.keys(out).length === 0 ? undefined : out;
}
