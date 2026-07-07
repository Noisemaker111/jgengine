import { useMemo, type ReactNode } from "react";

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
  const visible = useMemo(
    () => (visibleKinds === undefined ? null : new Set<BuildingPartKind>(visibleKinds)),
    [visibleKinds],
  );
  return (
    <group name={building.id}>
      {building.parts.map((part) => {
        if (visible !== null && !visible.has(part.kind)) return null;
        const rendered = kit?.renderPart?.(part);
        if (rendered !== undefined) return <group key={part.id}>{rendered}</group>;
        return <BuildingBlock key={part.id} part={part} palette={palette} />;
      })}
    </group>
  );
}
