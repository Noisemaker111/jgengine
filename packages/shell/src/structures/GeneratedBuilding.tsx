import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

export type BuildingFacade = "front" | "back" | "left" | "right" | "roof";
export type BuildingPartKind =
  | "wall"
  | "window"
  | "awning"
  | "airConditioner"
  | "clothesline"
  | "storefront"
  | "shutter"
  | "storeSign"
  | "roof"
  | "roofProp"
  | "guardrail"
  | "corner";

export interface BuildingPartPlacement {
  id: string;
  kind: BuildingPartKind;
  facade: BuildingFacade;
  position: readonly [number, number, number];
  rotationY: number;
  scale: readonly [number, number, number];
}

export interface GeneratedBuildingData {
  id: string;
  parts: readonly BuildingPartPlacement[];
}

export interface BuildingMaterialPalette {
  wall?: string;
  window?: string;
  awning?: string;
  airConditioner?: string;
  clothesline?: string;
  storefront?: string;
  shutter?: string;
  storeSign?: string;
  roof?: string;
  roofProp?: string;
  guardrail?: string;
  corner?: string;
}

export interface BuildingKitRenderer {
  renderPart?: (part: BuildingPartPlacement) => ReactNode | undefined;
}

export interface BuildingBlockProps {
  part: BuildingPartPlacement;
  palette?: BuildingMaterialPalette;
}

export interface GeneratedBuildingProps {
  building: GeneratedBuildingData;
  palette?: BuildingMaterialPalette;
  kit?: BuildingKitRenderer;
  visibleKinds?: readonly BuildingPartKind[];
}

export interface InstancedBuildingPlacement {
  building: GeneratedBuildingData;
  position?: readonly [number, number, number];
  /** Building yaw (radians) applied to the whole massing about `pivot` — street-aware facing. */
  rotationY?: number;
  /** World XZ the `rotationY` turns about (the building center); defaults to the world origin. */
  pivot?: readonly [number, number];
}

export interface InstancedBuildingsProps {
  buildings: readonly InstancedBuildingPlacement[];
  palette?: BuildingMaterialPalette;
  visibleKinds?: readonly BuildingPartKind[];
}

const DEFAULT_PALETTE: Required<BuildingMaterialPalette> = {
  wall: "#83766a",
  window: "#8ecae6",
  awning: "#c2410c",
  airConditioner: "#d4d4d8",
  clothesline: "#facc15",
  storefront: "#3f3f46",
  shutter: "#52525b",
  storeSign: "#f97316",
  roof: "#57534e",
  roofProp: "#14b8a6",
  guardrail: "#a8a29e",
  corner: "#6b6258",
};

function colorFor(kind: BuildingPartKind, palette: BuildingMaterialPalette | undefined): string {
  return palette?.[kind] ?? DEFAULT_PALETTE[kind];
}

function normalFor(facade: BuildingFacade): readonly [number, number] {
  if (facade === "front") return [0, 1];
  if (facade === "back") return [0, -1];
  if (facade === "left") return [-1, 0];
  if (facade === "right") return [1, 0];
  return [0, 0];
}

function outwardOffset(part: BuildingPartPlacement): number {
  if (part.kind === "wall" || part.kind === "roof" || part.kind === "corner") return 0;
  if (part.kind === "window" || part.kind === "shutter" || part.kind === "storefront") return 0.025;
  if (part.kind === "awning" || part.kind === "storeSign") return 0.09;
  return 0.12;
}

function materialFor(part: BuildingPartPlacement, palette: BuildingMaterialPalette | undefined) {
  const color = colorFor(part.kind, palette);
  if (part.kind === "window" || part.kind === "storefront") {
    return <meshPhysicalMaterial color={color} roughness={0.12} metalness={0} transparent opacity={0.56} />;
  }
  if (part.kind === "storeSign") {
    return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.5} />;
  }
  if (part.kind === "roofProp") {
    return <meshStandardMaterial color={color} roughness={0.65} metalness={0.1} />;
  }
  return <meshStandardMaterial color={color} roughness={0.88} metalness={0} />;
}

function batchMaterialFor(kind: BuildingPartKind, palette: BuildingMaterialPalette | undefined): THREE.Material {
  const color = colorFor(kind, palette);
  if (kind === "window" || kind === "storefront") {
    return new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.56 });
  }
  if (kind === "storeSign") {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.5 });
  }
  if (kind === "roofProp") {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1 });
  }
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
}

const CLOTHESLINE_ROW_OFFSETS = [-0.09, 0.09] as const;

function bucketPartMatrices(
  buildings: readonly InstancedBuildingPlacement[],
  visible: ReadonlySet<BuildingPartKind> | null,
): Map<BuildingPartKind, THREE.Matrix4[]> {
  const dummy = new THREE.Object3D();
  const buckets = new Map<BuildingPartKind, THREE.Matrix4[]>();
  for (const placement of buildings) {
    const [ox, oy, oz] = placement.position ?? [0, 0, 0];
    // Building yaw turns the whole massing about its center. Engine Y-rotation convention (matches
    // dummy.rotation.y below): a local vector (x, z) maps to (x·cos + z·sin, −x·sin + z·cos).
    const yaw = placement.rotationY ?? 0;
    const [px0, pz0] = placement.pivot ?? [0, 0];
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (const part of placement.building.parts) {
      if (visible !== null && !visible.has(part.kind)) continue;
      const [nx, nz] = normalFor(part.facade);
      const offset = outwardOffset(part);
      // Local offset from the pivot (part position + facade-normal nudge), then rotated by the yaw.
      const lx = part.position[0] - px0 + nx * offset;
      const lz = part.position[2] - pz0 + nz * offset;
      const px = ox + px0 + lx * cos + lz * sin;
      const py = oy + part.position[1];
      const pz = oz + pz0 - lx * sin + lz * cos;
      const partYaw = part.rotationY + yaw;
      let bucket = buckets.get(part.kind);
      if (bucket === undefined) {
        bucket = [];
        buckets.set(part.kind, bucket);
      }
      if (part.kind === "clothesline") {
        const rowSin = Math.sin(partYaw);
        const rowCos = Math.cos(partYaw);
        for (const row of CLOTHESLINE_ROW_OFFSETS) {
          dummy.position.set(px + row * rowSin, py, pz + row * rowCos);
          dummy.rotation.set(0, partYaw, 0);
          dummy.scale.set(part.scale[0], Math.max(part.scale[1], 0.025), 0.025);
          dummy.updateMatrix();
          bucket.push(dummy.matrix.clone());
        }
        continue;
      }
      dummy.position.set(px, py, pz);
      dummy.rotation.set(0, partYaw, 0);
      dummy.scale.set(part.scale[0], part.scale[1], part.scale[2]);
      dummy.updateMatrix();
      bucket.push(dummy.matrix.clone());
    }
  }
  return buckets;
}

function BuildingKindBatch({
  kind,
  matrices,
  palette,
  geometry,
}: {
  kind: BuildingPartKind;
  matrices: readonly THREE.Matrix4[];
  palette?: BuildingMaterialPalette;
  geometry: THREE.BoxGeometry;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => batchMaterialFor(kind, palette), [kind, palette]);
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, material]);
  return (
    <instancedMesh
      key={matrices.length}
      ref={meshRef}
      args={[geometry, material, matrices.length]}
      castShadow
      receiveShadow
    />
  );
}

export function InstancedBuildings({ buildings, palette, visibleKinds }: InstancedBuildingsProps) {
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const buckets = useMemo(() => {
    const visible = visibleKinds === undefined ? null : new Set<BuildingPartKind>(visibleKinds);
    return bucketPartMatrices(buildings, visible);
  }, [buildings, visibleKinds]);
  if (buckets.size === 0) return null;
  return (
    <group>
      {[...buckets.entries()].map(([kind, matrices]) => (
        <BuildingKindBatch key={kind} kind={kind} matrices={matrices} palette={palette} geometry={geometry} />
      ))}
    </group>
  );
}

function BlockMesh({ part, palette }: BuildingBlockProps) {
  const [nx, nz] = normalFor(part.facade);
  const offset = outwardOffset(part);
  const position: [number, number, number] = [
    part.position[0] + nx * offset,
    part.position[1],
    part.position[2] + nz * offset,
  ];
  return (
    <mesh position={position} rotation={[0, part.rotationY, 0]} castShadow receiveShadow>
      <boxGeometry args={[part.scale[0], part.scale[1], part.scale[2]]} />
      {materialFor(part, palette)}
    </mesh>
  );
}

export function BuildingBlock({ part, palette }: BuildingBlockProps) {
  if (part.kind === "clothesline") {
    const [nx, nz] = normalFor(part.facade);
    const offset = outwardOffset(part);
    const position: [number, number, number] = [
      part.position[0] + nx * offset,
      part.position[1],
      part.position[2] + nz * offset,
    ];
    return (
      <group position={position} rotation={[0, part.rotationY, 0]}>
        <mesh position={[0, 0, -0.09]} castShadow>
          <boxGeometry args={[part.scale[0], Math.max(part.scale[1], 0.025), 0.025]} />
          {materialFor(part, palette)}
        </mesh>
        <mesh position={[0, 0, 0.09]} castShadow>
          <boxGeometry args={[part.scale[0], Math.max(part.scale[1], 0.025), 0.025]} />
          {materialFor(part, palette)}
        </mesh>
      </group>
    );
  }
  return <BlockMesh part={part} palette={palette} />;
}

export function GeneratedBuilding({ building, palette, kit, visibleKinds }: GeneratedBuildingProps) {
  const { kitParts, batched } = useMemo(() => {
    const visible = visibleKinds === undefined ? null : new Set<BuildingPartKind>(visibleKinds);
    const kitRendered: { id: string; node: ReactNode }[] = [];
    const batchedParts: BuildingPartPlacement[] = [];
    for (const part of building.parts) {
      if (visible !== null && !visible.has(part.kind)) continue;
      const rendered = kit?.renderPart?.(part);
      if (rendered !== undefined) {
        kitRendered.push({ id: part.id, node: rendered });
        continue;
      }
      batchedParts.push(part);
    }
    const placements: InstancedBuildingPlacement[] =
      batchedParts.length === 0 ? [] : [{ building: { id: building.id, parts: batchedParts } }];
    return { kitParts: kitRendered, batched: placements };
  }, [building, kit, visibleKinds]);
  return (
    <group name={building.id}>
      {kitParts.map((entry) => (
        <group key={entry.id}>{entry.node}</group>
      ))}
      <InstancedBuildings buildings={batched} palette={palette} />
    </group>
  );
}
