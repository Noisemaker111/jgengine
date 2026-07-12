import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";

import type {
  EditorDocument,
  EditorKindVisibility,
  EditorMarker,
  EditorPath,
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
};

const RING_SEGMENTS = 40;
const MARKER_SEGMENTS = 8;

function colorFor(kind: string, override?: string): string {
  return override ?? DEFAULT_COLORS[kind] ?? "#ffffff";
}

function isVisible(visibility: EditorKindVisibility, kind: string): boolean {
  return visibility[kind] !== false;
}

function makeRingPositions(radius: number, y: number, segments: number): Float32Array {
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    positions[i * 3] = Math.cos(t) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(t) * radius;
  }
  return positions;
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
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.35, 0]} geometry={sharedCone}>
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
});

/** Cheap ground ring via THREE.LineLoop — no transparent fills. */
const VolumeRing = memo(function VolumeRing({
  volume,
  selected,
  onSelect,
}: {
  volume: EditorVolume;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = colorFor(volume.kind, volume.color);
  const radius =
    volume.radius ??
    (volume.halfExtents !== undefined ? Math.max(volume.halfExtents.x, volume.halfExtents.z) : 5);
  const safeRadius = Math.max(0.5, radius);

  const object = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(makeRingPositions(safeRadius, 0.4, RING_SEGMENTS), 3),
    );
    const material = new THREE.LineBasicMaterial({
      color: selected ? "#ffffff" : color,
      transparent: true,
      opacity: selected ? 1 : 0.8,
    });
    return new THREE.LineLoop(geometry, material);
  }, [safeRadius, color, selected]);

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

const PathRibbon = memo(function PathRibbon({ path }: { path: EditorPath }) {
  const color = colorFor(path.kind, path.color);
  const object = useMemo(() => {
    if (path.points.length < 2) return null;
    const stride = path.points.length > 80 ? 2 : 1;
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
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    return new THREE.Line(geometry, material);
  }, [path.points, color]);

  useEffect(
    () => () => {
      if (object === null) return;
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    },
    [object],
  );

  if (object === null) return null;
  return <primitive object={object} />;
});

/** Renders every visible marker, volume, and path from a document as in-scene 3D gizmos. */
export function EditorLayerOverlays({
  document,
  visibility,
  selection,
  onSelect,
}: {
  document: EditorDocument;
  visibility: EditorKindVisibility;
  selection: readonly string[];
  onSelect: (id: string) => void;
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

  // Stringify visibility so layer toggles re-filter without new object identity issues.
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

  return (
    <group>
      {volumes.map((volume) => (
        <VolumeRing
          key={volume.id}
          volume={volume}
          selected={selected.has(volume.id)}
          onSelect={onSelect}
        />
      ))}
      {paths.map((path) => (
        <PathRibbon key={path.id} path={path} />
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
    </group>
  );
}
