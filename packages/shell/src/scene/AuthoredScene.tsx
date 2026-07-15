import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { EditorDocument } from "@jgengine/core/editor/index";
import { buildRoadRibbon, roundPathCorners } from "@jgengine/core/world/roads";
import { isScatterPath, resolveScatter } from "@jgengine/core/world/scatterRegion";
import type { TerrainField } from "@jgengine/core/world/terrain";

import { InstancedScatter } from "../scatter/InstancedScatter";

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
    (path) => !isScatterPath(path) && (kinds === undefined || kinds.includes(path.kind)),
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
}

/**
 * Renders an editor document's scene content — draped paths plus GPU-instanced foliage — from one
 * mount, grounded on the live `field`. The runtime counterpart to authoring a scene in the editor:
 * drag paths and foliage regions, save `editor.scene.json`, and the game plays them with no bespoke
 * render code. Terrain/collision come from the world's ground field (`environment({ sculpt })`);
 * place markers with your own entity spawns.
 */
export function AuthoredScene({ document, field, pathKinds }: AuthoredSceneProps) {
  const instances = useMemo(() => resolveScatter(document, field), [document, field]);
  return (
    <>
      <AuthoredPaths document={document} field={field} {...(pathKinds === undefined ? {} : { kinds: pathKinds })} />
      <InstancedScatter instances={instances} />
    </>
  );
}
