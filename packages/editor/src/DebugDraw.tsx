import { memo, useEffect, useMemo } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type {
  EditorDocument,
  EditorKindVisibility,
  EditorMarker,
  EditorNote,
  EditorPath,
  EditorVec3,
  EditorVolume,
} from "@jgengine/core/editor/index";
import { markerCatalogId } from "@jgengine/core/world/authoredObjects";
import { AnchoredOverlay } from "@jgengine/core/hud/hudOverlay.draw";
import { SceneObjectAttach, SceneObjectGroup, SceneObjectList } from "@jgengine/core/frame/useEngineDraw.draw";

const DEFAULT_COLORS: Record<string, string> = {
  player_spawn: "#22d3ee",
  boss: "#f43f5e",
  mob: "#f97316",
  vendor: "#a78bfa",
  chest: "#fbbf24",
  travel: "#34d399",
  npc: "#60a5fa",
  poi: "#e879f9",
  goal: "#f472b6",
  branch: "#facc15",
  zone: "#38bdf8",
  flatten: "#94a3b8",
  cluster: "#fb923c",
  aggro: "#ef4444",
  leash: "#f59e0b",
  discover: "#4ade80",
  capture: "#f472b6",
  prompt: "#c084fc",
  respawn_skip: "#64748b",
  road: "#cbd5e1",
  corridor: "#38bdf8",
  route: "#e2e8f0",
  note: "#fde68a",
};

const RING_SEGMENTS = 40;
const MARKER_SEGMENTS = 8;

function colorFor(kind: string, override?: string): string {
  return override ?? DEFAULT_COLORS[kind] ?? "#ffffff";
}

function isVisible(visibility: EditorKindVisibility, kind: string): boolean {
  return visibility[kind] !== false;
}

function pushRing(
  out: number[],
  radius: number,
  y: number,
  axis: "y" | "x" | "z",
  segments = RING_SEGMENTS,
): void {
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    const pa = ringPoint(radius, y, axis, a);
    const pb = ringPoint(radius, y, axis, b);
    out.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2]);
  }
}

function ringPoint(radius: number, offset: number, axis: "y" | "x" | "z", t: number): [number, number, number] {
  const c = Math.cos(t) * radius;
  const s = Math.sin(t) * radius;
  if (axis === "y") return [c, offset, s];
  if (axis === "x") return [offset, c, s];
  return [c, s, offset];
}

function volumeWireframe(volume: EditorVolume): Float32Array {
  const out: number[] = [];
  if (volume.shape === "box") {
    const he = volume.halfExtents ?? { x: volume.radius ?? 5, y: volume.height ?? 4, z: volume.radius ?? 5 };
    const xs = [-he.x, he.x];
    const ys = [0, he.y * 2];
    const zs = [-he.z, he.z];
    for (const y of ys) {
      out.push(xs[0]!, y, zs[0]!, xs[1]!, y, zs[0]!);
      out.push(xs[1]!, y, zs[0]!, xs[1]!, y, zs[1]!);
      out.push(xs[1]!, y, zs[1]!, xs[0]!, y, zs[1]!);
      out.push(xs[0]!, y, zs[1]!, xs[0]!, y, zs[0]!);
    }
    for (const x of xs) for (const z of zs) out.push(x, ys[0]!, z, x, ys[1]!, z);
    return new Float32Array(out);
  }
  const radius = Math.max(0.5, volume.radius ?? 5);
  if (volume.shape === "cylinder") {
    const height = Math.max(0.5, volume.height ?? 4);
    pushRing(out, radius, 0.1, "y");
    pushRing(out, radius, height, "y");
    for (let i = 0; i < 4; i += 1) {
      const t = (i / 4) * Math.PI * 2;
      out.push(Math.cos(t) * radius, 0.1, Math.sin(t) * radius, Math.cos(t) * radius, height, Math.sin(t) * radius);
    }
    return new Float32Array(out);
  }
  pushRing(out, radius, 0.1, "y");
  pushRing(out, radius, 0, "x");
  pushRing(out, radius, 0, "z");
  return new Float32Array(out);
}

/** Shell-cyan selection fill — replaces the old white debug tint. */
const SELECTION_COLOR = "#67e8f9";
/** Pre-selection hover fill (softer cyan, not selected). */
const HOVER_COLOR = "#22d3ee";

function emphasisColor(selected: boolean, hovered: boolean, base: string): string {
  if (selected) return SELECTION_COLOR;
  if (hovered) return HOVER_COLOR;
  return base;
}

const MarkerMesh = memo(function MarkerMesh({
  marker,
  selected,
  hovered,
  sharedSphere,
  sharedCone,
  groundHeightAt,
}: {
  marker: EditorMarker;
  selected: boolean;
  hovered: boolean;
  sharedSphere: THREE.SphereGeometry;
  sharedCone: THREE.ConeGeometry;
  groundHeightAt?: ((x: number, z: number) => number) | undefined;
}) {
  const color = colorFor(marker.kind, marker.color);
  const scale = selected ? 1.28 : hovered ? 1.12 : 1;
  const baseY = groundHeightAt !== undefined ? groundHeightAt(marker.position.x, marker.position.z) : marker.position.y;
  const fill = emphasisColor(selected, hovered, color);
  const modelBacked = markerCatalogId(marker) !== null;
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: fill,
        transparent: true,
        opacity: selected ? 1 : hovered ? 0.9 : 1,
        wireframe: modelBacked,
        depthWrite: !modelBacked,
      }),
    [fill, selected, hovered, modelBacked],
  );
  const haloMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: fill,
        transparent: true,
        opacity: selected ? 0.28 : 0.18,
        wireframe: modelBacked,
        depthWrite: false,
      }),
    [fill, selected, hovered, modelBacked],
  );
  const arrowMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: selected || hovered ? fill : color }),
    [selected, hovered, fill, color],
  );
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);
  useEffect(() => () => haloMaterial.dispose(), [haloMaterial]);
  useEffect(() => () => arrowMaterial.dispose(), [arrowMaterial]);
  const body = useMemo(() => new THREE.Mesh(sharedSphere, bodyMaterial), [sharedSphere, bodyMaterial]);
  const halo = useMemo(() => {
    const mesh = new THREE.Mesh(sharedSphere, haloMaterial);
    mesh.scale.setScalar(1.18);
    return mesh;
  }, [sharedSphere, haloMaterial]);
  const arrow = useMemo(() => {
    const mesh = new THREE.Mesh(sharedCone, arrowMaterial);
    mesh.position.set(0, 1.35, 0);
    return mesh;
  }, [sharedCone, arrowMaterial]);
  return (
    <SceneObjectGroup
      position={[marker.position.x, baseY + 1.2, marker.position.z]}
      rotationY={marker.rotationY ?? 0}
      scale={[scale, scale, scale]}
      userData={{ jgEditorId: marker.id }}
    >
      <SceneObjectAttach object={body} />
      {selected || hovered ? <SceneObjectAttach object={halo} /> : null}
      <SceneObjectAttach object={arrow} />
    </SceneObjectGroup>
  );
});

/** Shape-true wireframe — ground ring plus vertical profile for spheres, cylinders, and boxes. */
const VolumeShapeLines = memo(function VolumeShapeLines({
  volume,
  selected,
  hovered,
}: {
  volume: EditorVolume;
  selected: boolean;
  hovered: boolean;
}) {
  const color = colorFor(volume.kind, volume.color);
  const object = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(volumeWireframe(volume), 3));
    const material = new THREE.LineBasicMaterial({
      color: emphasisColor(selected, hovered, color),
      transparent: true,
      opacity: selected ? 1 : hovered ? 0.9 : 0.75,
      linewidth: selected || hovered ? 2 : 1,
    });
    return new THREE.LineSegments(geometry, material);
  }, [
    volume.shape,
    volume.radius,
    volume.height,
    volume.halfExtents?.x,
    volume.halfExtents?.y,
    volume.halfExtents?.z,
    color,
    selected,
    hovered,
  ]);

  useEffect(
    () => () => {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    },
    [object],
  );

  return (
    <SceneObjectGroup
      position={[volume.center.x, volume.center.y, volume.center.z]}
      userData={{ jgEditorId: volume.id }}
    >
      <SceneObjectAttach object={object} />
    </SceneObjectGroup>
  );
});

const PathRibbon = memo(function PathRibbon({
  path,
  selected,
  hovered,
  activePointIndex,
  groundHeightAt,
}: {
  path: EditorPath;
  selected: boolean;
  hovered: boolean;
  activePointIndex: number | null;
  groundHeightAt?: ((x: number, z: number) => number) | undefined;
}) {
  const color = colorFor(path.kind, path.color);
  const yAt = (point: { x: number; y: number; z: number }): number =>
    groundHeightAt !== undefined ? groundHeightAt(point.x, point.z) : point.y;
  const object = useMemo(() => {
    if (path.points.length < 2) return null;
    const stride = !selected && !hovered && path.points.length > 80 ? 2 : 1;
    const picked: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < path.points.length; i += stride) {
      picked.push(path.points[i]!);
    }
    const last = path.points[path.points.length - 1]!;
    const tail = picked[picked.length - 1];
    if (tail === undefined || tail.x !== last.x || tail.z !== last.z) picked.push(last);

    const positions = new Float32Array(picked.length * 3);
    picked.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = yAt(point) + 0.8;
      positions[index * 3 + 2] = point.z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: emphasisColor(selected, hovered, color),
      transparent: true,
      opacity: selected ? 1 : hovered ? 0.92 : 0.85,
    });
    return new THREE.Line(geometry, material);
  }, [path.points, color, selected, hovered, groundHeightAt]);

  useEffect(
    () => () => {
      if (object === null) return;
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    },
    [object],
  );

  const pointMeshes = useMemo(() => {
    if (!selected) return [];
    return path.points.map((point, index) => {
      const geometry = new THREE.SphereGeometry(index === activePointIndex ? 0.7 : 0.45, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color: index === activePointIndex ? "#22d3ee" : "#ffffff" });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(point.x, yAt(point) + 0.8, point.z);
      return mesh;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path.points, selected, activePointIndex, groundHeightAt]);
  useEffect(
    () => () => {
      for (const mesh of pointMeshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
    [pointMeshes],
  );
  if (object === null) return null;
  return (
    <SceneObjectGroup userData={{ jgEditorId: path.id }}>
      <SceneObjectAttach object={object} />
      <SceneObjectList objects={pointMeshes} />
    </SceneObjectGroup>
  );
});

const NotePin = memo(function NotePin({
  note,
  selected,
  hovered,
  groundHeightAt,
}: {
  note: EditorNote;
  selected: boolean;
  hovered: boolean;
  groundHeightAt?: ((x: number, z: number) => number) | undefined;
}) {
  const color = colorFor("note", note.color);
  const baseY = groundHeightAt !== undefined ? groundHeightAt(note.position.x, note.position.z) : note.position.y;
  const fill = emphasisColor(selected, hovered, color);
  const scale = selected ? 1.32 : hovered ? 1.15 : 1;
  const bodyMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: fill, transparent: true, opacity: selected ? 1 : hovered ? 0.9 : 1 }),
    [fill, selected, hovered],
  );
  const haloMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: fill, transparent: true, opacity: selected ? 0.28 : 0.16, depthWrite: false }),
    [fill, selected, hovered],
  );
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);
  useEffect(() => () => haloMaterial.dispose(), [haloMaterial]);
  const bodyGeometry = useMemo(() => new THREE.OctahedronGeometry(0.6), []);
  const body = useMemo(() => {
    const mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    mesh.scale.setScalar(scale);
    return mesh;
  }, [bodyGeometry, bodyMaterial, scale]);
  const halo = useMemo(() => {
    const mesh = new THREE.Mesh(bodyGeometry, haloMaterial);
    mesh.scale.setScalar(1.22);
    return mesh;
  }, [bodyGeometry, haloMaterial]);
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);
  return (
    <SceneObjectGroup
      position={[note.position.x, baseY + 1, note.position.z]}
      userData={{ jgEditorId: note.id }}
    >
      <SceneObjectAttach object={body} />
      {selected || hovered ? <SceneObjectAttach object={halo} /> : null}
      <AnchoredOverlay position={[0, 0, 0]} localPosition={[0, 0, 0]} anchor={undefined} distanceFactor={40}>
        <div
          style={{
            transform: "translateY(-24px)",
            whiteSpace: "nowrap",
            maxWidth: "220px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: "11px",
            color: "#fde68a",
            background: "rgba(0,0,0,0.6)",
            borderRadius: "4px",
            padding: "1px 6px",
          }}
        >
          {note.text}
        </div>
      </AnchoredOverlay>
    </SceneObjectGroup>
  );
});

/** Live preview of an in-progress path drawing: placed points and the connecting line. */
export function PathDraftPreview({ points }: { points: readonly EditorVec3[] }) {
  const object = useMemo(() => {
    if (points.length < 2) return null;
    const positions = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y + 0.8;
      positions[index * 3 + 2] = point.z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: "#22d3ee" });
    return new THREE.Line(geometry, material);
  }, [points]);

  useEffect(
    () => () => {
      if (object === null) return;
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    },
    [object],
  );

  const pointMeshes = useMemo(
    () =>
      points.map((point) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 8, 8),
          new THREE.MeshBasicMaterial({ color: "#22d3ee" }),
        );
        mesh.position.set(point.x, point.y + 0.8, point.z);
        return mesh;
      }),
    [points],
  );
  useEffect(
    () => () => {
      for (const mesh of pointMeshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
    [pointMeshes],
  );
  return (
    <>
      {object !== null ? <SceneObjectAttach object={object} /> : null}
      <SceneObjectList objects={pointMeshes} />
    </>
  );
}

/** Renders every visible marker, volume, path, and note from a document as in-scene 3D gizmos. */
export function EditorLayerOverlays({
  document,
  visibility,
  selection,
  hoverId = null,
  activePathPoint,
  groundHeightAt,
}: {
  document: EditorDocument;
  visibility: EditorKindVisibility;
  selection: readonly string[];
  /** Pre-selection hover id from viewport pointer pick; ignored when already selected. */
  hoverId?: string | null;
  activePathPoint?: { pathId: string; index: number } | null;
  groundHeightAt?: (x: number, z: number) => number;
}) {
  const selected = useMemo(() => new Set(selection), [selection]);
  const isHovered = (id: string) => hoverId === id && !selected.has(id);
  const sharedSphere = useMemo(
    () => new THREE.SphereGeometry(0.85, MARKER_SEGMENTS, MARKER_SEGMENTS),
    [],
  );
  const sharedCone = useMemo(() => new THREE.ConeGeometry(0.35, 0.9, 6), []);
  useEffect(
    () => () => {
      sharedSphere.dispose();
      sharedCone.dispose();
    },
    [sharedSphere, sharedCone],
  );

  const visibilityKey = useMemo(() => JSON.stringify(visibility), [visibility]);
  const volumes = useMemo(
    () => document.volumes.filter((volume) => isVisible(visibility, volume.kind) && volume.hidden !== true),
    [document.volumes, visibilityKey, visibility],
  );
  const paths = useMemo(
    () => document.paths.filter((path) => isVisible(visibility, path.kind) && path.hidden !== true),
    [document.paths, visibilityKey, visibility],
  );
  const markers = useMemo(
    () => document.markers.filter((marker) => isVisible(visibility, marker.kind) && marker.hidden !== true),
    [document.markers, visibilityKey, visibility],
  );
  const notes = useMemo(
    () =>
      isVisible(visibility, "note")
        ? document.annotations.filter((note) => note.hidden !== true)
        : [],
    [document.annotations, visibilityKey, visibility],
  );

  return (
    <>
      {volumes.map((volume) => (
        <VolumeShapeLines
          key={volume.id}
          volume={volume}
          selected={selected.has(volume.id)}
          hovered={isHovered(volume.id)}
        />
      ))}
      {paths.map((path) => (
        <PathRibbon
          key={path.id}
          path={path}
          selected={selected.has(path.id)}
          hovered={isHovered(path.id)}
          activePointIndex={
            activePathPoint != null && activePathPoint.pathId === path.id ? activePathPoint.index : null
          }
          groundHeightAt={groundHeightAt}
        />
      ))}
      {markers.map((marker) => (
        <MarkerMesh
          key={marker.id}
          marker={marker}
          selected={selected.has(marker.id)}
          hovered={isHovered(marker.id)}
          sharedSphere={sharedSphere}
          sharedCone={sharedCone}
          groundHeightAt={groundHeightAt}
        />
      ))}
      {notes.map((note) => (
        <NotePin
          key={note.id}
          note={note}
          selected={selected.has(note.id)}
          hovered={isHovered(note.id)}
          groundHeightAt={groundHeightAt}
        />
      ))}
    </>
  );
}
