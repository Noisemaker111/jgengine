// @skill jgengine-world
import { AuthoredFlocks } from "@jgengine/core/ai/AuthoredFlocks.draw";
import { AuthoredWeatherLayer } from "@jgengine/core/weather/AuthoredWeatherLayer.draw";
import { Fragment, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { EditorDocument, EditorMarker, EditorPath, EditorVolume } from "@jgengine/core/editor/index";
import {
  getDocumentLiveSync,
  subscribeDocumentLiveSyncInstall,
} from "@jgengine/core/editor/index";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import {
  placeAuthoredObjects,
  resolveAuthoredObjectsWithDiagnostics,
  syncAuthoredObjects,
  type ResolveAuthoredObjectsOptions,
} from "@jgengine/core/world/authoredObjects";
import { syncAuthoredSolids } from "@jgengine/core/world/authoredSolids";
import type { RoadEnvironmentDescriptor } from "@jgengine/core/world/features";
import { pathRoad } from "@jgengine/core/roads/pathRoads";
import { isScatterPath, resolveScatter } from "@jgengine/core/scatter/scatterRegion";
import { scatterClearingOf } from "@jgengine/core/scatter/scatterClearing";
import { syncScatterSolids, type ScatterSolidSpec } from "@jgengine/core/scatter/scatterSolids";
import type { TerrainField } from "@jgengine/core/terrain/terrain";

import { PARTS_OUTPUT, placedGeneratorFor } from "@jgengine/core/scene/assetGenerator";
import { GeneratorMeshInstance } from "@jgengine/core/generator/GeneratorMeshInstance.draw";
import { isScatterGeneratorItem, type ScatterGeneratorItem } from "@jgengine/core/scatter/scatterGenerator";
import { useGameContext } from "@jgengine/react/provider";

import { Roads } from "@jgengine/core/roads/RoadRibbons.draw";

import { createModelMapResolver } from "@jgengine/core/model/resolveModel";
import { InstancedScatter } from "@jgengine/core/scatter/InstancedScatter.draw";
import { GeneratedAssetInstance } from "./GeneratedAssetRenderer.draw";
import { registerBuiltinSceneKindRenderers } from "./builtinSceneKindRenderers.draw";
import { getSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers.draw";

const noopSubscribe = (): (() => void) => () => undefined;

/**
 * Resolves the document AuthoredScene renders: when a {@link getDocumentLiveSync} bus is
 * installed (editor host live), subscribe to document patches; otherwise use the prop.
 * Document is authoritative — runtime overrides never land here unless written back.
 * @internal
 */
export function useLiveEditorDocument(document: EditorDocument, live = true): EditorDocument {
  const subscribeLive = useCallback((onStoreChange: () => void) => {
    let unsubDoc = getDocumentLiveSync()?.subscribeDocument(onStoreChange);
    const unsubInstall = subscribeDocumentLiveSyncInstall(() => {
      unsubDoc?.();
      unsubDoc = getDocumentLiveSync()?.subscribeDocument(onStoreChange);
      onStoreChange();
    });
    return () => {
      unsubInstall();
      unsubDoc?.();
    };
  }, []);
  const getDocument = useCallback(
    () => (live ? (getDocumentLiveSync()?.getDocument() ?? document) : document),
    [live, document],
  );
  return useSyncExternalStore(live ? subscribeLive : noopSubscribe, getDocument, getDocument);
}

registerBuiltinSceneKindRenderers();

function markerToKindObject(marker: EditorMarker): SceneKindObject {
  return { id: marker.id, kind: marker.kind, position: marker.position, ...(marker.rotationY === undefined ? {} : { rotationY: marker.rotationY }), ...(marker.meta === undefined ? {} : { meta: marker.meta }) };
}

function volumeToKindObject(volume: EditorVolume): SceneKindObject {
  return {
    id: volume.id,
    kind: volume.kind,
    center: volume.center,
    ...(volume.halfExtents === undefined ? {} : { halfExtents: volume.halfExtents }),
    ...(volume.radius === undefined ? {} : { radius: volume.radius }),
    ...(volume.meta === undefined ? {} : { meta: volume.meta }),
  };
}

function pathToKindObject(path: EditorPath): SceneKindObject {
  return { id: path.id, kind: path.kind, points: path.points.map((point) => ({ x: point.x, y: point.y, z: point.z })), ...(path.meta === undefined ? {} : { meta: path.meta }) };
}

/** Renders every marker placed as a parametric generator asset, re-resolved from its `meta` + seed. */
function AuthoredGenerators({ document, field }: { document: EditorDocument; field: TerrainField }) {
  const markers = useMemo(
    () => document.markers.flatMap((marker) => {
      const definition = placedGeneratorFor(marker.meta);
      return definition === undefined ? [] : [{ marker, definition }];
    }),
    [document.markers],
  );
  return (
    <>
      {markers.map(({ marker, definition }) => {
        const position = [marker.position.x, field.sampleHeight(marker.position.x, marker.position.z), marker.position.z] as const;
        return definition.output === PARTS_OUTPUT
          ? <GeneratedAssetInstance key={marker.id} meta={marker.meta} position={position} rotationY={marker.rotationY ?? 0} />
          : <GeneratorMeshInstance key={marker.id} definition={definition} meta={marker.meta} fallbackSeed={marker.id} position={position} rotationY={marker.rotationY ?? 0} />;
      })}
    </>
  );
}

/**
 * Mounts every registered studio renderer for the kinds present in a document — water and any
 * game/example-registered kind — grouping objects by kind and handing each renderer its slice.
 * Scatter stays on the batched {@link InstancedScatter} path (its cross-region avoid masks need the
 * whole document), so it is skipped here.
 */
function AuthoredStudios({ document, context }: { document: EditorDocument; context: SceneKindRenderContext }) {
  const byKind = useMemo(() => {
    const groups = new Map<string, SceneKindObject[]>();
    const add = (kind: string, object: SceneKindObject) => {
      if (isScatterPath({ kind } as EditorPath) || getSceneKindRenderer(kind) === undefined) return;
      const bucket = groups.get(kind);
      if (bucket === undefined) groups.set(kind, [object]);
      else bucket.push(object);
    };
    for (const marker of document.markers) add(marker.kind, markerToKindObject(marker));
    for (const volume of document.volumes) add(volume.kind, volumeToKindObject(volume));
    for (const path of document.paths) add(path.kind, pathToKindObject(path));
    return groups;
  }, [document]);
  return (
    <>
      {[...byKind.entries()].map(([kind, objects]) => {
        const renderer = getSceneKindRenderer(kind);
        return renderer === undefined ? null : <Fragment key={kind}>{renderer({ objects, context })}</Fragment>;
      })}
    </>
  );
}

/** Props for {@link AuthoredPaths}: the document, the ground field to drape over, and a kind filter. */
export interface AuthoredPathsProps {
  document: EditorDocument;
  field: TerrainField;
  /** Only render these path kinds; default renders every non-scatter path. */
  kinds?: readonly string[];
  /**
   * Shade paths with the terrain's procedural surfaces (dirt, gravel, paving), wear and soft edges.
   * Default true; false keeps flat-colour ribbons. One path opts out with `meta.surfaceDetail: false`.
   */
  surfaceDetail?: boolean;
}

/**
 * Renders a document's non-scatter paths (roads, routes, corridors) as ground-draped ribbons — the
 * editor authors the polyline, the engine drapes it over the live terrain at runtime. Width comes
 * from `path.width`, color from `path.meta.color`/`path.color`, and the procedural surface from
 * `path.meta.surface` or the kind (see `resolvePathSurface`). A game never hand-rolls path meshes.
 * @capability authored-paths drape editor-authored paths over live terrain as surfaced ribbons
 */
export function AuthoredPaths({ document, field, kinds, surfaceDetail = true }: AuthoredPathsProps) {
  const roads = useMemo(
    () =>
      document.paths
        .filter((path) => !isScatterPath(path) && getSceneKindRenderer(path.kind) === undefined && (kinds === undefined || kinds.includes(path.kind)))
        .map((path) => pathRoad(path, { surfaceDetail }))
        .filter((entry): entry is RoadEnvironmentDescriptor => entry !== null),
    [document.paths, kinds, surfaceDetail],
  );
  return <Roads roads={roads} field={field} />;
}

/** Props for {@link AuthoredObjects}: document, ground field, and optional lift / onExisting. */
export interface AuthoredObjectsProps extends ResolveAuthoredObjectsOptions {
  document: EditorDocument;
  field: TerrainField;
  /** Extra lift in meters on top of each marker's own verticalOffset (default 0). */
  verticalOffset?: number;
  /**
   * How to treat instance ids already in the object store. Default `"keep"` so an onInit
   * `placeAuthoredObjects` call wins and remounts stay remount-safe.
   */
  onExisting?: "throw" | "replace" | "keep";
  /** Synchronize authored edits and remove previously owned placements absent from the document. */
  synchronize?: boolean;
}

/**
 * Places every editor marker with a catalog id into `ctx.scene.object`, grounded on `field`.
 * WorldScene renders them through the game's `objectModels` seam — no bespoke place loop. Pure
 * headless twin: `resolveAuthoredObjects` / `placeAuthoredObjects`.
 * @capability authored-objects place editor markers with catalog ids into the scene, grounded on the terrain
 */
export function AuthoredObjects({
  document,
  field,
  verticalOffset = 0,
  onExisting = "keep",
  synchronize = false,
  excludeKinds,
}: AuthoredObjectsProps) {
  const ctx = useGameContext();
  const previousObjects = useRef<ReturnType<typeof resolveAuthoredObjectsWithDiagnostics>["objects"]>([]);
  const previousStore = useRef(ctx.scene.object);
  const resolved = useMemo(
    () => resolveAuthoredObjectsWithDiagnostics(document, excludeKinds === undefined ? {} : { excludeKinds }),
    [document, excludeKinds],
  );
  const warnedResult = useRef<typeof resolved | null>(null);
  const objects = resolved.objects;
  useEffect(() => {
    if (warnedResult.current !== resolved) {
      warnedResult.current = resolved;
      for (const diagnostic of resolved.diagnostics) console.warn(`[jgengine] ${diagnostic.path}: ${diagnostic.message}. ${diagnostic.repair}`);
    }
    if (previousStore.current !== ctx.scene.object) { previousObjects.current = []; previousStore.current = ctx.scene.object; }
    if (synchronize) {
      previousObjects.current = syncAuthoredObjects(ctx.scene.object, objects, previousObjects.current, (x, z) => field.sampleHeight(x, z), { verticalOffset });
      return;
    }
    placeAuthoredObjects(ctx.scene.object, objects, (x, z) => field.sampleHeight(x, z), {
      verticalOffset,
      onExisting,
    });
  }, [ctx.scene.object, field, resolved, objects, onExisting, verticalOffset, synchronize]);
  return null;
}

/**
 * Writes the document's studio solids (city buildings and any kind with a `solids` hook) into
 * `ctx.world.solids`, so what the studios draw also blocks the player, NPCs and physics.
 * @capability authored-solids collision for studio-authored world content such as city volumes
 */
export function AuthoredSolids({ document, field }: { document: EditorDocument; field: TerrainField }) {
  const ctx = useGameContext();
  useEffect(() => {
    syncAuthoredSolids(ctx.world.solids, document, (x, z) => field.sampleHeight(x, z));
  }, [ctx.world.solids, document, field]);
  useEffect(
    () => () => {
      syncAuthoredSolids(ctx.world.solids, { markers: [], volumes: [], paths: [] });
    },
    [ctx.world.solids],
  );
  return null;
}

/** Resolve palette items to generator items directly and to models through the catalog. */
function scatterItemResolver(
  map: Record<string, string | ModelConfig | ScatterGeneratorItem> | undefined,
  assets: AssetCatalog | undefined,
): ((item: string) => ModelConfig | ScatterGeneratorItem | null) | undefined {
  if (map === undefined) return undefined;
  const models: Record<string, string | ModelConfig> = {};
  const grown = new Map<string, ScatterGeneratorItem>();
  for (const [item, value] of Object.entries(map)) {
    if (isScatterGeneratorItem(value)) grown.set(item, value);
    else models[item] = value;
  }
  const resolveModel = createModelMapResolver(models, assets, "scatterModels");
  if (grown.size === 0) return resolveModel;
  return (item) => grown.get(item) ?? resolveModel?.(item) ?? null;
}

/** Props for {@link AuthoredScene}: the document to render and the ground field to drape/ground on. */
export interface AuthoredSceneProps {
  document: EditorDocument;
  /** Register bounded procedural weather counts in the supported diagnostics probes. */
  diagnostics?: boolean;
  field: TerrainField;
  /** Restrict rendered path kinds; default renders every non-scatter path. */
  pathKinds?: readonly string[];
  /** Procedural surface, wear and soft edges on paths (default true); see {@link AuthoredPathsProps.surfaceDetail}. */
  pathSurfaceDetail?: boolean;
  /**
   * Scatter palette item id → model asset id, `ModelConfig`, or {@link ScatterGeneratorItem}; a mapped
   * item GPU-instances the real catalog GLB, or a generator's baked variants, instead of the stylized
   * proxy. Keyed by scatter `item` (not entity name — pass a dedicated map even if it shares entries
   * with `entityModels`). Asset ids and model configs require `assets`.
   */
  scatterModels?: Record<string, string | ModelConfig | ScatterGeneratorItem>;
  /** Most scatter instances drawn; past it the foliage thins evenly. Default 20000. */
  scatterBudget?: number;
  /** Scatter palette item → the box each of its placements blocks with; unlisted items stay walk-through. */
  scatterSolids?: Readonly<Record<string, ScatterSolidSpec>>;
  /** Animated models keyed by authored cosmetic habitat species. */
  flockModels?: Record<string, string | ModelConfig>;
  /** Catalog `scatterModels` string ids resolve through; required together with `scatterModels`. */
  assets?: AssetCatalog;
  /**
   * When true (default), subscribe to the global document live-sync bus if the editor host is
   * mounted so headless/RPC document patches hot-apply without a full reload. Pass false to pin
   * the `document` prop (tests, one-shot previews).
   */
  live?: boolean;
  /**
   * Place the document's catalog-id markers into the object
   * store — WorldScene renders them via the game's `objectModels` seam. Omit when the game places
   * props itself in onInit with `placeAuthoredObjects`. `excludeKinds` replaces the resolver's
   * default mob/boss exclusions; include those when adding other game-owned entity spawn kinds.
   */
  placeObjects?: boolean | ({ verticalOffset?: number } & ResolveAuthoredObjectsOptions);
  /** Terrain surface color sampler forwarded to studio renderers (see `SceneKindRenderContext.groundColorAt`). */
  groundColorAt?: (x: number, z: number) => string;
}

/**
 * Renders an editor document's scene content — draped paths plus GPU-instanced foliage — from one
 * mount, grounded on the live `field`. The runtime counterpart to authoring a scene in the editor:
 * drag paths and foliage regions, save `editor.scene.json`, and the game plays them with no bespoke
 * render code. When a live-sync bus is installed (editor host), document patches stream in and
 * re-render automatically — document is authoritative; runtime overrides stay ephemeral unless
 * written back. Terrain/collision come from the world's ground field (`environment({ sculpt })`);
 * place markers with your own entity spawns. Pass `scatterModels`+`assets` to resolve palette items to
 * real catalog GLBs; unmapped items keep the stylized proxy.
 */
export function AuthoredScene({
  document,
  diagnostics = false,
  field,
  pathKinds,
  pathSurfaceDetail = true,
  scatterModels,
  scatterBudget,
  scatterSolids,
  flockModels,
  assets,
  live = true,
  placeObjects,
  groundColorAt,
}: AuthoredSceneProps) {
  const ctx = useGameContext();
  const liveDocument = useLiveEditorDocument(document, live);
  // Authoring updates configuration only. Physics remains owned by the fixed game-time stages.
  useEffect(() => { ctx.environment.retune(liveDocument); }, [ctx.environment, liveDocument]);
  const instances = useMemo(() => resolveScatter(liveDocument, field), [liveDocument, field]);
  const clearing = scatterClearingOf(ctx);
  const hidden = useSyncExternalStore(clearing.subscribe, clearing.hidden, clearing.hidden);
  const solidPlacements = useMemo(
    () => (scatterSolids === undefined ? [] : instances.filter((instance) => scatterSolids[instance.item] !== undefined)),
    [instances, scatterSolids],
  );
  // Felling a tree changes `hidden` too; rebuild the rock layer only when a solid placement's visibility changed.
  const solidHidden = useMemo(() => {
    const ids = new Set<string>();
    for (const placement of solidPlacements) if (hidden.has(placement.id)) ids.add(placement.id);
    return ids;
  }, [solidPlacements, hidden]);
  const solidHiddenKey = [...solidHidden].sort().join("|");
  useEffect(() => {
    if (scatterSolids === undefined) return;
    syncScatterSolids(ctx.world.solids, solidPlacements, scatterSolids, solidHidden);
    // solidHidden is read through its key so an unrelated clearing change does not rebuild the layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.world.solids, solidPlacements, scatterSolids, solidHiddenKey]);
  useEffect(
    () => () => {
      if (scatterSolids !== undefined) syncScatterSolids(ctx.world.solids, [], {});
    },
    [ctx.world.solids, scatterSolids],
  );
  const resolveItem = useMemo(
    () => scatterItemResolver(scatterModels, assets),
    [scatterModels, assets],
  );
  const shouldPlaceObjects = placeObjects === true || (typeof placeObjects === "object" && placeObjects !== null);
  const objectVerticalOffset = typeof placeObjects === "object" && placeObjects !== null ? (placeObjects.verticalOffset ?? 0) : 0;
  const objectExcludeKinds = typeof placeObjects === "object" && placeObjects !== null ? placeObjects.excludeKinds : undefined;
  return (
    <>
      <AuthoredWeatherLayer document={liveDocument} heightAt={field.sampleHeight} diagnostics={diagnostics} />
      {flockModels === undefined ? null : <AuthoredFlocks models={flockModels} assets={assets} />}
      <AuthoredPaths
        document={liveDocument}
        field={field}
        surfaceDetail={pathSurfaceDetail}
        {...(pathKinds === undefined ? {} : { kinds: pathKinds })}
      />
      <InstancedScatter instances={instances} hidden={hidden} {...(scatterBudget === undefined ? {} : { maxInstances: scatterBudget })} {...(resolveItem === undefined ? {} : { resolveItem })} />
      <AuthoredStudios
        document={liveDocument}
        context={{
          document: liveDocument,
          field,
          ...(assets === undefined ? {} : { assets }),
          ...(groundColorAt === undefined ? {} : { groundColorAt }),
        }}
      />
      <AuthoredGenerators document={liveDocument} field={field} />
      <AuthoredSolids document={liveDocument} field={field} />
      {shouldPlaceObjects ? (
        <AuthoredObjects document={liveDocument} field={field} verticalOffset={objectVerticalOffset} synchronize={live && getDocumentLiveSync() !== null}
          {...(objectExcludeKinds === undefined ? {} : { excludeKinds: objectExcludeKinds })} />
      ) : null}
    </>
  );
}
