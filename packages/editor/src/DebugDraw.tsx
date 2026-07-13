import { Html } from "@react-three/drei";
import { memo, useEffect, useMemo } from "react";
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

const MarkerMesh = memo(function MarkerMesh({
  marker,
  selected,
  onSelect,
  sharedSphere,
  sharedCone,
}: {
  marker: EditorMarker;
  selected: boolean;
  onSelect: (id: string) => void;
  sharedSphere: THREE.SphereGeometry;
  sharedCone: THREE.ConeGeometry;
}) {
  const color = colorFor(marker.kind, marker.color);
  const scale = selected ? 1.25 : 1;
  return (
    <group
      position={[marker.position.x, marker.position.y + 1.2, marker.position.z]}
      rotation-y={marker.rotationY ?? 0}
      scale={scale}
      userData={{ jgEditorId: marker.id }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(marker.id);
      }}
    >
      <mesh geometry={sharedSphere}>
        <meshBasicMaterial color={selected ? "#ffffff" : color} />
      </mesh>
      <mesh position={[0, 1.35, 0]} geometry={sharedCone}>
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
});

/** Shape-true wireframe — ground ring plus vertical profile for spheres, cylinders, and boxes. */
const VolumeShapeLines = memo(function VolumeShapeLines({
  volume,
  selected,
  onSelect,
}: {
  volume: EditorVolume;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = colorFor(volume.kind, volume.color);
  const object = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(volumeWireframe(volume), 3));
    const material = new THREE.LineBasicMaterial({
      color: selected ? "#ffffff" : color,
      transparent: true,
      opacity: selected ? 1 : 0.75,
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
  ]);

  useEffect(
    () => () => {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    },
    [object],
  );

  return (
    <group
      position={[volume.center.x, volume.center.y, volume.center.z]}
      userData={{ jgEditorId: volume.id }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(volume.id);
      }}
    >
      <primitive object={object} />
    </group>
  );
});

const PathRibbon = memo(function PathRibbon({
  path,
  selected,
  activePointIndex,
  onSelect,
}: {
  path: EditorPath;
  selected: boolean;
  activePointIndex: number | null;
  onSelect: (id: string) => void;
}) {
  const color = colorFor(path.kind, path.color);
  const object = useMemo(() => {
    if (path.points.length < 2) return null;
    const stride = !selected && path.points.length > 80 ? 2 : 1;
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
      positions[index * 3 + 1] = point.y + 0.8;
      positions[index * 3 + 2] = point.z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: selected ? "#ffffff" : color,
      transparent: true,
      opacity: selected ? 1 : 0.85,
    });
    return new THREE.Line(geometry, material);
  }, [path.points, color, selected]);

  useEffect(
    () => () => {
      if (object === null) return;
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    },
    [object],
  );

  if (object === null) return null;
  return (
    <group
      userData={{ jgEditorId: path.id }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(path.id);
      }}
    >
      <primitive object={object} />
      {selected
        ? path.points.map((point, index) => (
            <mesh key={index} position={[point.x, point.y + 0.8, point.z]}>
              <sphereGeometry args={[index === activePointIndex ? 0.7 : 0.45, 8, 8]} />
              <meshBasicMaterial color={index === activePointIndex ? "#22d3ee" : "#ffffff"} />
            </mesh>
          ))
        : null}
    </group>
  );
});

const NotePin = memo(function NotePin({
  note,
  selected,
  onSelect,
}: {
  note: EditorNote;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = colorFor("note", note.color);
  return (
    <group
      position={[note.position.x, note.position.y + 1, note.position.z]}
      userData={{ jgEditorId: note.id }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(note.id);
      }}
    >
      <mesh scale={selected ? 1.3 : 1}>
        <octahedronGeometry args={[0.6]} />
        <meshBasicMaterial color={selected ? "#ffffff" : color} />
      </mesh>
      <Html center distanceFactor={40} style={{ pointerEvents: "none" }}>
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
      </Html>
    </group>
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

  return (
    <group>
      {object !== null ? <primitive object={object} /> : null}
      {points.map((point, index) => (
        <mesh key={index} position={[point.x, point.y + 0.8, point.z]}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial color="#22d3ee" />
        </mesh>
      ))}
    </group>
  );
}

/** Renders every visible marker, volume, path, and note from a document as in-scene 3D gizmos. */
export function EditorLayerOverlays({
  document,
  visibility,
  selection,
  onSelect,
  activePathPoint,
}: {
  document: EditorDocument;
  visibility: EditorKindVisibility;
  selection: readonly string[];
  onSelect: (id: string) => void;
  activePathPoint?: { pathId: string; index: number } | null;
}) {
  const selected = useMemo(() => new Set(selection), [selection]);
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
    () => document.volumes.filter((volume) => isVisible(visibility, volume.kind)),
    [document.volumes, visibilityKey, visibility],
  );
  const paths = useMemo(
    () => document.paths.filter((path) => isVisible(visibility, path.kind)),
    [document.paths, visibilityKey, visibility],
  );
  const markers = useMemo(
    () => document.markers.filter((marker) => isVisible(visibility, marker.kind)),
    [document.markers, visibilityKey, visibility],
  );
  const notes = useMemo(
    () => (isVisible(visibility, "note") ? document.annotations : []),
    [document.annotations, visibilityKey, visibility],
  );

  return (
    <group>
      {volumes.map((volume) => (
        <VolumeShapeLines
          key={volume.id}
          volume={volume}
          selected={selected.has(volume.id)}
          onSelect={onSelect}
        />
      ))}
      {paths.map((path) => (
        <PathRibbon
          key={path.id}
          path={path}
          selected={selected.has(path.id)}
          activePointIndex={
            activePathPoint != null && activePathPoint.pathId === path.id ? activePathPoint.index : null
          }
          onSelect={onSelect}
        />
      ))}
      {markers.map((marker) => (
        <MarkerMesh
          key={marker.id}
          marker={marker}
          selected={selected.has(marker.id)}
          onSelect={onSelect}
          sharedSphere={sharedSphere}
          sharedCone={sharedCone}
        />
      ))}
      {notes.map((note) => (
        <NotePin key={note.id} note={note} selected={selected.has(note.id)} onSelect={onSelect} />
      ))}
    </group>
  );
}
