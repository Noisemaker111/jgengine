import { Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { BuildingKitSlot } from "@jgengine/core/world/buildings";
import type { BuildingKit } from "@jgengine/core/world/buildingKit";

import { useDisposable } from "../render/useDisposable";
import { BuildingKitBatch } from "./BuildingKitBatch";
import { bucketBuildingParts, normalFor, outwardOffset } from "./buildingKitFit";

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
  /** Which kit variant this slot asks for; emitted by the generator, consumed by `BuildingKit` binding. */
  kit?: BuildingKitSlot;
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
  /** Per-part React escape hatch, tried before the kit; return undefined to fall through. */
  partRenderer?: BuildingKitRenderer;
  /** Binds part kinds to instanced GLB models; unbound kinds keep the palette boxes. */
  kit?: BuildingKit;
  /** Maps a kit part's `model` reference to a loadable URL. Defaults to identity. */
  resolveModelUrl?: (model: string) => string;
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
  /**
   * Binds part kinds to instanced GLB models. Kinds the kit leaves unbound keep rendering the palette
   * boxes, and kinds it lists in `omit` render nothing; omit the prop for today's all-box massing.
   */
  kit?: BuildingKit;
  /** Maps a kit part's `model` reference to a loadable URL. Defaults to identity. */
  resolveModelUrl?: (model: string) => string;
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
  const material = useDisposable(() => batchMaterialFor(kind, palette), [kind, palette]);
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

export function InstancedBuildings({
  buildings,
  palette,
  kit,
  resolveModelUrl,
  visibleKinds,
}: InstancedBuildingsProps) {
  const geometry = useDisposable(() => new THREE.BoxGeometry(1, 1, 1), []);
  const { boxes, models } = useMemo(() => {
    const visible = visibleKinds === undefined ? null : new Set<BuildingPartKind>(visibleKinds);
    return bucketBuildingParts(buildings, visible, kit, resolveModelUrl);
  }, [buildings, visibleKinds, kit, resolveModelUrl]);
  if (boxes.size === 0 && models.size === 0) return null;
  return (
    <group>
      {[...boxes.entries()].map(([kind, matrices]) => (
        <BuildingKindBatch key={kind} kind={kind} matrices={matrices} palette={palette} geometry={geometry} />
      ))}
      {[...models.entries()].map(([url, instances]) => (
        <Suspense key={url} fallback={null}>
          <BuildingKitBatch url={url} instances={instances} />
        </Suspense>
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

export function GeneratedBuilding({
  building,
  palette,
  partRenderer,
  kit,
  resolveModelUrl,
  visibleKinds,
}: GeneratedBuildingProps) {
  const { kitParts, batched } = useMemo(() => {
    const visible = visibleKinds === undefined ? null : new Set<BuildingPartKind>(visibleKinds);
    const kitRendered: { id: string; node: ReactNode }[] = [];
    const batchedParts: BuildingPartPlacement[] = [];
    for (const part of building.parts) {
      if (visible !== null && !visible.has(part.kind)) continue;
      const rendered = partRenderer?.renderPart?.(part);
      if (rendered !== undefined) {
        kitRendered.push({ id: part.id, node: rendered });
        continue;
      }
      batchedParts.push(part);
    }
    const placements: InstancedBuildingPlacement[] =
      batchedParts.length === 0 ? [] : [{ building: { id: building.id, parts: batchedParts } }];
    return { kitParts: kitRendered, batched: placements };
  }, [building, partRenderer, visibleKinds]);
  return (
    <group name={building.id}>
      {kitParts.map((entry) => (
        <group key={entry.id}>{entry.node}</group>
      ))}
      <InstancedBuildings
        buildings={batched}
        palette={palette}
        kit={kit}
        resolveModelUrl={resolveModelUrl}
      />
    </group>
  );
}
