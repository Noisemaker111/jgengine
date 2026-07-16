import { Fragment, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import type { EditorDocument, EditorMarker, EditorPath, EditorVolume } from "@jgengine/core/editor/index";
import {
  getDocumentLiveSync,
  subscribeDocumentLiveSyncInstall,
} from "@jgengine/core/editor/index";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import { buildRoadRibbon, roundPathCorners } from "@jgengine/core/world/roads";
import { isScatterPath, resolveScatter } from "@jgengine/core/world/scatterRegion";
import type { TerrainField } from "@jgengine/core/world/terrain";

import { getAssetGenerator } from "@jgengine/core/scene/assetGenerator";

import { createModelMapResolver } from "../render/resolveModel";
import { InstancedScatter } from "../scatter/InstancedScatter";
import { GeneratedAssetInstance } from "./GeneratedAssetRenderer";
import { registerBuiltinSceneKindRenderers } from "./builtinSceneKindRenderers";
import { getSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

/**
 * Resolves the document AuthoredScene renders: when a {@link getDocumentLiveSync} bus is
 * installed (editor host live), subscribe to document patches; otherwise use the prop.
 * Document is authoritative — runtime overrides never land here unless written back.
 * @internal
 */
export function useLiveEditorDocument(document: EditorDocument, live = true): EditorDocument {
  const [resolved, setResolved] = useState(document);
  useEffect(() => {
    if (!live) {
      setResolved(document);
      return;
    }
    let unsubDoc: (() => void) | undefined;
    const attach = () => {
      unsubDoc?.();
      unsubDoc = undefined;
      const sync = getDocumentLiveSync();
      if (sync === null) {
        setResolved(document);
        return;
      }
      setResolved(sync.getDocument());
      unsubDoc = sync.subscribeDocument((event) => setResolved(event.document));
    };
    attach();
    const unsubInstall = subscribeDocumentLiveSyncInstall(attach);
    return () => {
      unsubInstall();
      unsubDoc?.();
    };
  }, [document, live]);
  return live ? resolved : document;
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
    () => document.markers.filter((marker) => typeof marker.meta?.["assetId"] === "string" && getAssetGenerator(marker.meta["assetId"] as string) !== undefined),
    [document.markers],
  );
  return (
    <>
      {markers.map((marker) => (
        <GeneratedAssetInstance
          key={marker.id}
          meta={marker.meta}
          position={[marker.position.x, field.sampleHeight(marker.position.x, marker.position.z), marker.position.z]}
          rotationY={marker.rotationY ?? 0}
        />
      ))}
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

const DEFAULT_PATH_COLOR = "#7a6444";

/** One editor path drawn as a ground-draped ribbon — subdivided and sampled against the live field. */
function DrapedPath({
  points,
  width,
  color,
  field,
}: {
  points: readonly (readonly [number, number])[];
  width: number;
  color: string;
  field: TerrainField;
}) {
  const geometry = useMemo(() => {
    // Fillet sharp turns first so bends read as smooth arcs, not overlapping rectangles.
    const rounded = roundPathCorners(points, Math.max(1.5, width * 0.9), 6);
    const ribbon = buildRoadRibbon(rounded, width, (x, z) => field.sampleHeight(x, z), {
      elevation: 0.18,
      maxSegmentLength: 1,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(ribbon.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
    geo.computeVertexNormals();
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, field]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (points.length < 2) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={color} roughness={1} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

function pathColor(meta: Record<string, unknown> | undefined, color: string | undefined): string {
  if (typeof meta?.["color"] === "string") return meta["color"] as string;
  return color ?? DEFAULT_PATH_COLOR;
}

/** Props for {@link AuthoredPaths}: the document, the ground field to drape over, and a kind filter. */
export interface AuthoredPathsProps {
  document: EditorDocument;
  field: TerrainField;
  /** Only render these path kinds; default renders every non-scatter path. */
  kinds?: readonly string[];
}

/**
 * Renders a document's non-scatter paths (roads, routes, corridors) as ground-draped ribbons — the
 * editor authors the polyline, the engine drapes it over the live terrain at runtime. Width comes
 * from `path.width`, color from `path.meta.color`/`path.color`. A game never hand-rolls path meshes.
 */
export function AuthoredPaths({ document, field, kinds }: AuthoredPathsProps) {
  const paths = document.paths.filter(
    (path) => !isScatterPath(path) && getSceneKindRenderer(path.kind) === undefined && (kinds === undefined || kinds.includes(path.kind)),
  );
  return (
    <>
      {paths.map((path) => (
        <DrapedPath
          key={path.id}
          points={path.points.map((point) => [point.x, point.z] as const)}
          width={path.width ?? 4}
          color={pathColor(path.meta, path.color)}
          field={field}
        />
      ))}
    </>
  );
}

/** Props for {@link AuthoredScene}: the document to render and the ground field to drape/ground on. */
export interface AuthoredSceneProps {
  document: EditorDocument;
  field: TerrainField;
  /** Restrict rendered path kinds; default renders every non-scatter path. */
  pathKinds?: readonly string[];
  /**
   * Scatter palette item id → model asset id or `ModelConfig`; a mapped item GPU-instances the real
   * catalog GLB instead of the stylized proxy. Keyed by scatter `item` (not entity name — pass a
   * dedicated map even if it shares entries with `entityModels`). Requires `assets`.
   */
  scatterModels?: Record<string, string | ModelConfig>;
  /** Catalog `scatterModels` string ids resolve through; required together with `scatterModels`. */
  assets?: AssetCatalog;
  /**
   * When true (default), subscribe to the global document live-sync bus if the editor host is
   * mounted so headless/RPC document patches hot-apply without a full reload. Pass false to pin
   * the `document` prop (tests, one-shot previews).
   */
  live?: boolean;
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
  field,
  pathKinds,
  scatterModels,
  assets,
  live = true,
}: AuthoredSceneProps) {
  const liveDocument = useLiveEditorDocument(document, live);
  const instances = useMemo(() => resolveScatter(liveDocument, field), [liveDocument, field]);
  const resolveItem = useMemo(
    () => createModelMapResolver(scatterModels, assets, "scatterModels"),
    [scatterModels, assets],
  );
  return (
    <>
      <AuthoredPaths document={liveDocument} field={field} {...(pathKinds === undefined ? {} : { kinds: pathKinds })} />
      <InstancedScatter instances={instances} {...(resolveItem === undefined ? {} : { resolveItem })} />
      <AuthoredStudios
        document={liveDocument}
        context={{ document: liveDocument, field, ...(assets === undefined ? {} : { assets }) }}
      />
      <AuthoredGenerators document={liveDocument} field={field} />
    </>
  );
}
