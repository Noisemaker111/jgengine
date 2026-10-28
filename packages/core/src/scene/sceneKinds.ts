/**
 * The parametric-studio seam: a registry that maps an editor object `kind` to a typed parameter
 * schema (drives the inspector + `meta` parse/validation), an optional pure-data `resolve` (turns a
 * document object into renderable data), and `+ Add` menu metadata. Registering a kind lets a third
 * party ship a new authorable "studio" (pole line, water, bookcase) — schema + resolver here, a
 * matching renderer in `shell` — without editing editor or engine files. Scatter is the proof adopter.
 * The schema itself is `@jgengine/core/generator/paramSchema`.
 */

import { parseParams, type ParamField, type ParamSchema, type ParsedParams } from "../generator/paramSchema";
import type { WorldSolid } from "../world/worldSolids";

/** Which document collection a scene kind lives in. Drives placement + which `meta` bag holds params. */
export type SceneKindTarget = "path" | "marker" | "volume";

/** A closed-polygon area vs an open polyline, for path-target kinds. Ignored for marker/volume kinds. */
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

/**
 * A registered scene kind — everything the editor/engine need to author and render a studio without
 * bespoke code. `schema` drives the inspector + parse; `resolve` (optional) turns one document object
 * into pure renderable data a matching `shell` renderer consumes; `add*` fields build the `+ Add` menu.
 * @typeParam TResolved — the kind's renderable payload (scatter instances, pole+cable set, …).
 */
export interface SceneKindDefinition<TResolved = unknown> {
  kind: string;
  target: SceneKindTarget;
  /** Human label for the inspector header and `+ Add` entry. */
  label: string;
  schema: ParamSchema;
  /** For path kinds: closed area (default) or open line. Ignored for markers/volumes. */
  pathShape?: ScenePathShape;
  /** `+ Add` menu section this kind lists under (e.g. "Studios"). Omit to hide from the menu. */
  addCategory?: string;
  /** Accent color for the inspector panel + `+ Add` entry, as a hex string. */
  accent?: string;
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
  /** Optional one-line readout under the inspector fields (estimate, dimensions) — owned by the studio. */
  note?: (object: SceneKindObject, params: ParsedParams) => string;
  /**
   * Optional scatterable-coverage descriptor. When set, the editor leads this kind's inspector with
   * the shared Area / Assets / Density `CoverageSection` and surfaces the budget clamp-and-warn note,
   * giving every scatterable kind (grass/scatter/city) one authoring pattern.
   */
  coverage?: SceneKindCoverage;
  /**
   * The registered generator (`@jgengine/core/generator/generator`) whose params this kind's `meta`
   * holds. When set, the editor adds the seeded variant grid (pick, keep, place) under the inspector.
   */
  generator?: string;
}

/** The raw document object a resolver receives — shape shared by markers, volumes, and paths. */
export interface SceneKindObject {
  id: string;
  kind: string;
  meta?: Record<string, unknown>;
  /** Present for path targets: the polyline/polygon points (XZ used). */
  points?: readonly { x: number; y: number; z: number }[];
  /** Present for marker targets: the placed position. */
  position?: { x: number; y: number; z: number };
  /** Present for volume targets: the region center. */
  center?: { x: number; y: number; z: number };
  /** Present for volume targets: box half-extents. */
  halfExtents?: { x: number; y: number; z: number };
  /** Present for volume targets: sphere/cylinder radius. */
  radius?: number;
  rotationY?: number;
}

/** Ground sampler + options a resolver may read (terrain height/normal snap). */
export interface SceneKindResolveContext {
  sampleHeight?: (x: number, z: number) => number;
  sampleNormal?: (x: number, z: number) => readonly [number, number, number];
  /** Every studio object in the same document, for kinds that read siblings (a `city` reads its `cityzone` volumes). */
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

/**
 * Declare a game's own **click-to-place** marker kind in one call — the light path for logical
 * markers a game reads off the document by `kind` (a stash, checkpoint, spawn point, bounty…), with
 * none of a full studio's schema/resolver boilerplate. Registering it makes the kind a click-to-place
 * tool in the editor's `+ Add` menu (grouped under `category`) and gives its markers an inspector for
 * any `fields` you pass. Call at module load from a module the editor loads (a game's `editorLayers`
 * import graph). Rendering is unaffected — the game still reads `kind` off `editorLayers.markers`.
 */
export function definePlaceableMarkerKind(options: {
  kind: string;
  label: string;
  /** `+ Add` menu section header this kind groups under. Defaults to `"Custom"`. */
  category?: string;
  /** Accent hex for the menu entry + inspector header. */
  accent?: string;
  /** Optional inspector fields written into each marker's `meta` (e.g. a payout value). */
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

/** The registered definition for a kind, or undefined if the kind is a plain (non-studio) kind. @internal */
export function getSceneKind(kind: string): SceneKindDefinition | undefined {
  return registry.get(kind);
}

/** True when a kind has a registered studio definition (schema/inspector/renderer). @internal */
export function isSceneKind(kind: string): boolean {
  return registry.has(kind);
}

/** Every registered kind, optionally filtered by target, in registration order. @internal */
export function listSceneKinds(target?: SceneKindTarget): SceneKindDefinition[] {
  const all = [...registry.values()];
  return target === undefined ? all : all.filter((definition) => definition.target === target);
}

/** Parse a document object's `meta` against its registered kind schema, or `null` if unregistered. @internal */
export function parseSceneKindParams(object: SceneKindObject): ParsedParams | null {
  const definition = registry.get(object.kind);
  return definition === undefined ? null : parseParams(definition.schema, object.meta);
}
