import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  buildingSurfaceColor,
  resolveBuildingSurface,
  type BuildingPartKind,
  type BuildingPartPlacement,
  type BuildingSurface,
  type BuildingSurfaceMaterial,
} from "@jgengine/core/buildings/buildings";
import type { BuildingKit } from "@jgengine/core/buildings/buildingKit";

import type { MaterialOverrideTextures } from "@jgengine/core/material/materialOverride.draw";
import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { BuildingKitBatch } from "./BuildingKitBatch.draw";
import { useBuildingChunkBudget } from "./BuildingRenderBudget.draw";
import { partitionInstances, type InstanceChunk } from "@jgengine/core/instancing/instanceChunks.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { bucketBuildingParts, normalFor, outwardOffset } from "./buildingKitFit.draw";
import { applyBuildingSurface, useBuildingSurfaceTextures } from "./buildingSurface.draw";

export interface GeneratedBuildingData {
  id: string;
  parts: readonly BuildingPartPlacement[];
}

/** Per part kind: a hex colour, or a colour plus tiled PBR maps (`BuildingSurfaceMaterial`). */
export type BuildingMaterialPalette = Partial<Record<BuildingPartKind, BuildingSurface>>;

export interface BuildingBlockProps {
  part: BuildingPartPlacement;
  palette?: BuildingMaterialPalette | undefined;
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

const DEFAULT_PALETTE: Record<BuildingPartKind, string> = {
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

function surfaceFor(kind: BuildingPartKind, palette: BuildingMaterialPalette | undefined): BuildingSurfaceMaterial {
  const surface = resolveBuildingSurface(palette?.[kind] ?? DEFAULT_PALETTE[kind]);
  return surface.color === undefined ? { ...surface, color: DEFAULT_PALETTE[kind] } : surface;
}

function colorFor(kind: BuildingPartKind, palette: BuildingMaterialPalette | undefined): string {
  return buildingSurfaceColor(palette?.[kind], DEFAULT_PALETTE[kind]);
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

function batchMaterialFor(
  kind: BuildingPartKind,
  surface: BuildingSurfaceMaterial,
  textures?: MaterialOverrideTextures,
): THREE.Material {
  const color = surface.color ?? DEFAULT_PALETTE[kind];
  const base =
    kind === "window" || kind === "storefront"
      ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.56 })
      : kind === "storeSign"
        ? new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.5 })
        : kind === "roofProp"
          ? new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1 })
          : new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
  return applyBuildingSurface(base, surface, textures);
}

const GLASS_KINDS: ReadonlySet<BuildingPartKind> = new Set(["window", "storefront"]);

/** Glass sits inside the full wall panel it is cut into, proud by only 2.5 cm, so where box walls draw they already cast its shadow. @internal */
export function boxKindCastsShadow(kind: BuildingPartKind, boxKinds: { has(kind: BuildingPartKind): boolean }): boolean {
  return !(GLASS_KINDS.has(kind) && boxKinds.has("wall"));
}

/**
 * Box kinds that draw with one material, merged into one instanced draw that tints each instance
 * with its kind's colour. A kind with its own texture maps stays alone.
 * @internal
 */
export interface BuildingBoxFamily {
  key: string;
  /** The kind whose material the family draws with. */
  kind: BuildingPartKind;
  surface: BuildingSurfaceMaterial;
  matrices: THREE.Matrix4[];
  /** One tint per matrix; null for a single kind, whose material carries its colour. */
  colors: THREE.Color[] | null;
  castShadow: boolean;
}

/** The material a box kind draws with, apart from its colour: kinds with the same one share a draw. */
function familyOf(kind: BuildingPartKind, surface: BuildingSurfaceMaterial): string {
  // A sign glows in its own colour, which a per-instance tint cannot carry.
  if (kind === "storeSign") return `kind:${kind}`;
  const base = GLASS_KINDS.has(kind) ? "glass" : kind === "roofProp" ? "prop" : "matte";
  // Maps tint by the colour the same way under an instance tint, so one set of maps at one tiling is one material.
  return JSON.stringify([base, surface.roughness ?? null, surface.metalness ?? null, surface.maps ?? null, surface.repeat ?? 1]);
}

/**
 * Groups a building set's box kinds into one draw per material: walls, corners, roofs and the other
 * matte kinds share one, glass kinds share one, so a city block costs a few draws, not one per kind.
 * @internal
 */
export function buildingBoxFamilies(boxes: ReadonlyMap<BuildingPartKind, readonly THREE.Matrix4[]>, palette: BuildingMaterialPalette | undefined): BuildingBoxFamily[] {
  const families = new Map<string, { kind: BuildingPartKind; surface: BuildingSurfaceMaterial; parts: { kind: BuildingPartKind; surface: BuildingSurfaceMaterial; matrices: readonly THREE.Matrix4[] }[]; castShadow: boolean }>();
  for (const [kind, matrices] of boxes) {
    const surface = surfaceFor(kind, palette);
    const key = familyOf(kind, surface);
    const family = families.get(key) ?? { kind, surface, parts: [], castShadow: boxKindCastsShadow(kind, boxes) };
    family.parts.push({ kind, surface, matrices });
    families.set(key, family);
  }
  return [...families].map(([key, family]) => {
    if (family.parts.length === 1) {
      return { key, kind: family.kind, surface: family.surface, matrices: [...(family.parts[0]?.matrices ?? [])], colors: null, castShadow: family.castShadow };
    }
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    for (const part of family.parts) {
      const color = new THREE.Color(part.surface.color ?? DEFAULT_PALETTE[part.kind]);
      for (const matrix of part.matrices) {
        matrices.push(matrix);
        colors.push(color);
      }
    }
    // The instance tint carries each kind's colour; the shared material stays white under it.
    return { key, kind: family.kind, surface: { ...family.surface, color: "#ffffff" }, matrices, colors, castShadow: family.castShadow };
  });
}

function BuildingFamilyBatch({ family, geometry }: { family: BuildingBoxFamily; geometry: THREE.BoxGeometry }) {
  const textures = useBuildingSurfaceTextures(family.surface);
  const material = useDisposable(() => batchMaterialFor(family.kind, family.surface, textures), [family, textures]);
  const chunks = useMemo(() => partitionInstances(geometry, family.matrices), [geometry, family]);
  return <>{chunks.map((chunk) => <BuildingChunk key={chunk.key} chunk={chunk} colors={family.colors} material={material} geometry={geometry} castShadow={family.castShadow} />)}</>;
}

function BuildingChunk({ chunk, colors, material, geometry, castShadow }: {
  chunk: InstanceChunk;
  colors: readonly THREE.Color[] | null;
  material: THREE.Material;
  geometry: THREE.BoxGeometry;
  castShadow: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useBuildingChunkBudget(meshRef, chunk.bounds);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const tint = colors === null ? {} : { colors: (index: number, out: THREE.Color) => { out.copy(colors[chunk.sources[index] ?? 0] ?? out.setRGB(1, 1, 1)); } };
    uploadInstances(mesh, chunk.matrices, { bounds: chunk.bounds, ...tint });
    freezeStaticTransforms(mesh);
    // Release only this chunk's instance buffers; geometry and materials are shared.
    return () => {
      mesh.dispose();
    };
  }, [chunk, colors, geometry, material]);
  return (
    <instancedMesh
      key={chunk.matrices.length}
      ref={meshRef}
      args={[geometry, material, chunk.matrices.length]}
      castShadow={castShadow}
      receiveShadow
      dispose={null}
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
  const families = useMemo(() => buildingBoxFamilies(boxes, palette), [boxes, palette]);
  if (boxes.size === 0 && models.size === 0) return null;
  return (
    <group>
      {families.map((family) => <BuildingFamilyBatch key={family.key} family={family} geometry={geometry} />)}
      {[...models.entries()].map(([url, instances]) => (
        <Suspense key={url} fallback={null}>
          <BuildingKitBatch url={url} instances={instances} materialAssets={kit?.materialAssets} />
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
