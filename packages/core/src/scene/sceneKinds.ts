import { parseParams, type ParamField, type ParamSchema, type ParsedParams } from "../generator/paramSchema";
import type { WorldSolid } from "../world/worldSolids";
import type { EditorEnvironment } from "../editor/types";

export type SceneKindTarget = "path" | "marker" | "volume";

export type ScenePathShape = "area" | "line";

/**
 * Marks a kind as *scatterable* — it fills an authored area with instances at one density under a
 * bounded budget — so the editor renders the shared `CoverageSection` (Area → Assets → Density slider
 * + budget note) that gives grass/scatter/city one authoring gesture. `spec` selects the unit + budget
 * from `@jgengine/core/scatter/scatterCoverage`; `densityKey` is the single density slider hoisted into
 * the coverage header (and hidden from the schema body below); `assetsKey` is the optional weighted
 * "what fills it" palette summarized in the header.
 */
export interface SceneKindCoverage {
  spec: import("../scatter/scatterCoverage").ScatterCoverageKind;
  densityKey: string;
  assetsKey?: string;
}

export interface SceneKindDefinition<TResolved = unknown> {
  kind: string;
  target: SceneKindTarget;
  label: string;
  schema: ParamSchema;
  pathShape?: ScenePathShape;
  addCategory?: string;
  accent?: string;
  placeMeta?: Readonly<Record<string, unknown>>;
  /**
   * Turn one document object (its geometry + parsed params) into pure renderable data. Pure — no
   * three.js/DOM. Omitted for kinds whose renderer reads the object directly. `object` is the raw
   * marker/volume/path; `params` is `parseParams(schema, object.meta)`.
   */
  resolve?: (object: SceneKindObject, params: ParsedParams, context: SceneKindResolveContext) => TResolved;
  /**
   * World-space collision for a resolved object. Omitted, the kind is render-only. `syncAuthoredSolids`
   * (`world/authoredSolids`) writes these into `ctx.world.solids`, so movement, NPCs, physics
   * backends and nav grids all collide with what the studio draws.
   */
  solids?: (resolved: TResolved, object: SceneKindObject, params: ParsedParams, context: SceneKindResolveContext) => readonly WorldSolid[];
  note?: (object: SceneKindObject, params: ParsedParams) => string;
  coverage?: SceneKindCoverage;
  generator?: string;
  nested?: readonly SceneKindNestedSettings[];
}

/**
 * A settings bag nested under one `meta` key, not spread across top-level fields: an untouched field
 * stays unset (so it can follow a curve or a world setting), and the editor writing a whole parsed
 * param set into `meta` never pins it.
 */
export interface SceneKindNestedSettings {
  key: string;
  label: string;
  schema: ParamSchema;
  effective: (object: SceneKindObject, environment: EditorEnvironment | undefined) => Readonly<Record<string, unknown>>;
}

export interface SceneKindObject {
  id: string;
  kind: string;
  meta?: Record<string, unknown>;
  points?: readonly { x: number; y: number; z: number }[];
  position?: { x: number; y: number; z: number };
  center?: { x: number; y: number; z: number };
  halfExtents?: { x: number; y: number; z: number };
  radius?: number;
  rotationY?: number;
}

export interface SceneKindResolveContext {
  sampleHeight?: (x: number, z: number) => number;
  sampleNormal?: (x: number, z: number) => readonly [number, number, number];
  objects?: readonly SceneKindObject[];
}

const registry = new Map<string, SceneKindDefinition>();

/**
 * Register a scene kind — the plug-in point for a new parametric studio. Idempotent per `kind` (last
 * registration wins), so a game's registration overrides a default. Call at module load; the editor
 * inspector, `+ Add` menu, and `AuthoredScene` renderer lookup all read this registry.
 */
export function registerSceneKind<TResolved>(definition: SceneKindDefinition<TResolved>): void {
  registry.set(definition.kind, definition as SceneKindDefinition);
}

export function definePlaceableMarkerKind(options: {
  kind: string;
  label: string;
  /** `+ Add` menu section header this kind groups under. Defaults to `"Custom"`. */
  category?: string;
  accent?: string;
  fields?: readonly ParamField[];
}): string {
  registerSceneKind({
    kind: options.kind,
    target: "marker",
    label: options.label,
    addCategory: options.category ?? "Custom",
    ...(options.accent === undefined ? {} : { accent: options.accent }),
    schema: { fields: options.fields ?? [] },
  });
  return options.kind;
}

/** @internal */
export function getSceneKind(kind: string): SceneKindDefinition | undefined {
  return registry.get(kind);
}

/** @internal */
export function placeMetaFor(kind: string): { meta?: Record<string, unknown> } {
  const meta = registry.get(kind)?.placeMeta;
  return meta === undefined ? {} : { meta: structuredClone(meta) as Record<string, unknown> };
}

/** @internal */
export function isSceneKind(kind: string): boolean {
  return registry.has(kind);
}

/** @internal */
export function listSceneKinds(target?: SceneKindTarget): SceneKindDefinition[] {
  const all = [...registry.values()];
  return target === undefined ? all : all.filter((definition) => definition.target === target);
}

/** @internal */
export function parseSceneKindParams(object: SceneKindObject): ParsedParams | null {
  const definition = registry.get(object.kind);
  return definition === undefined ? null : parseParams(definition.schema, object.meta);
}
