import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import {
  resolveBuildingSurface,
  type BuildingPartKind,
  type BuildingPartPlacement,
  type BuildingSurface,
  type BuildingSurfaceMaterial,
} from "@jgengine/core/buildings/buildings";
import type { BuildingKit } from "@jgengine/core/buildings/buildingKit";

import type { MaterialOverrideTextures } from "@jgengine/core/material/materialOverride.draw";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { buildingKitBatchDraw } from "./BuildingKitBatch.draw";
import { buildingChunkBudgetScratch, buildingRenderPolicy, syncBuildingChunkBudget } from "./BuildingRenderBudget.draw";
import { partitionInstances } from "@jgengine/core/instancing/instanceChunks.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { bucketBuildingParts } from "./buildingKitFit.draw";
import { applyBuildingSurface, buildingSurfaceTextures, type BuildingSurfaceTextureLease } from "./buildingSurface.draw";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

export interface GeneratedBuildingData {
  id: string;
  parts: readonly BuildingPartPlacement[];
}

/** Per part kind: a hex colour, or a colour plus tiled PBR maps (`BuildingSurfaceMaterial`). */
export type BuildingMaterialPalette = Partial<Record<BuildingPartKind, BuildingSurface>>;

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

/**
 * One box family's draw: an owned material (flat first, rebuilt with the surface's maps when they
 * land, like the `useDisposable` swap did) plus one budget-gated InstancedMesh per chunk.
 */
function buildingFamilyBatchDraw(family: BuildingBoxFamily, geometry: THREE.BoxGeometry): EngineDraw {
  const chunks = partitionInstances(geometry, family.matrices);
  const entries: { mesh: THREE.InstancedMesh; bounds: THREE.Box3; scratch: ReturnType<typeof buildingChunkBudgetScratch> }[] = [];
  let material: THREE.Material | null = null;
  let surfaceLease: BuildingSurfaceTextureLease | null = null;
  let disposed = false;
  return {
    priority: CAMERA_POST_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      material = batchMaterialFor(family.kind, family.surface, undefined);
      const colors = family.colors;
      for (const chunk of chunks) {
        const mesh = new THREE.InstancedMesh(geometry, material, chunk.matrices.length);
        mesh.castShadow = family.castShadow;
        mesh.receiveShadow = true;
        const tint = colors === null ? {} : { colors: (index: number, out: THREE.Color) => { out.copy(colors[chunk.sources[index] ?? 0] ?? out.setRGB(1, 1, 1)); } };
        uploadInstances(mesh, chunk.matrices, { bounds: chunk.bounds, ...tint });
        freezeStaticTransforms(mesh);
        state.scene.add(mesh);
        entries.push({ mesh, bounds: chunk.bounds, scratch: buildingChunkBudgetScratch() });
      }
      void buildingSurfaceTextures(family.surface).then((lease) => {
        if (disposed) {
          lease.dispose();
          return;
        }
        surfaceLease = lease;
        const next = batchMaterialFor(family.kind, family.surface, lease.textures);
        for (const entry of entries) entry.mesh.material = next;
        material?.dispose();
        material = next;
      }).catch((error: unknown) => {
        console.error(`[jgengine] building surface ${family.key} failed to load`, error);
      });
    },
    frame(state: EngineFrameState) {
      for (const entry of entries) syncBuildingChunkBudget(entry.mesh, entry.bounds, state.camera, entry.scratch, buildingRenderPolicy());
    },
    dispose(state: EngineFrameState) {
      disposed = true;
      for (const entry of entries.splice(0)) {
        state.scene.remove(entry.mesh);
        // Release only this chunk's instance buffers; geometry and materials are shared.
        entry.mesh.dispose();
      }
      material?.dispose();
      material = null;
      surfaceLease?.dispose();
      surfaceLease = null;
    },
  };
}

/**
 * The draw-side form of {@link InstancedBuildings}: buckets the placements once per prop-identity
 * change, then mounts one draw per box family and per kit model URL. Children hang under an owned
 * identity group so the scoped parent's transform applies exactly like the old `<group>` did.
 */
export function instancedBuildingsDraw(getProps: () => InstancedBuildingsProps): EngineDraw {
  const host = new THREE.Group();
  const children: EngineDraw[] = [];
  let geometry: THREE.BoxGeometry | null = null;
  let built: {
    buildings: readonly InstancedBuildingPlacement[];
    palette: BuildingMaterialPalette | undefined;
    kit: BuildingKit | undefined;
    resolveModelUrl: ((model: string) => string) | undefined;
    visibleKinds: readonly BuildingPartKind[] | undefined;
  } | null = null;

  const clearChildren = (frameState: EngineFrameState) => {
    for (const draw of children.splice(0)) draw.dispose?.(frameState);
  };

  const build = (mountState: EngineFrameState) => {
    const props = getProps();
    const childState = childFrameState(mountState, host);
    const visible = props.visibleKinds === undefined ? null : new Set<BuildingPartKind>(props.visibleKinds);
    const { boxes, models } = bucketBuildingParts(props.buildings, visible, props.kit, props.resolveModelUrl);
    const families = buildingBoxFamilies(boxes, props.palette);
    for (const family of families) {
      const draw = buildingFamilyBatchDraw(family, geometry!);
      children.push(draw);
      draw.mount?.(childState);
    }
    for (const [url, instances] of models) {
      const draw = buildingKitBatchDraw(() => ({ url, instances, materialAssets: props.kit?.materialAssets }));
      children.push(draw);
      draw.mount?.(childState);
    }
    built = {
      buildings: props.buildings,
      palette: props.palette,
      kit: props.kit,
      resolveModelUrl: props.resolveModelUrl,
      visibleKinds: props.visibleKinds,
    };
  };

  return {
    priority: CAMERA_POST_FRAME_PRIORITY,
    mount(mountState: EngineFrameState) {
      geometry = new THREE.BoxGeometry(1, 1, 1);
      mountState.scene.add(host);
      build(mountState);
    },
    update(mountState: EngineFrameState) {
      const props = getProps();
      if (built === null) return;
      if (
        props.buildings !== built.buildings ||
        props.palette !== built.palette ||
        props.kit !== built.kit ||
        props.resolveModelUrl !== built.resolveModelUrl ||
        props.visibleKinds !== built.visibleKinds
      ) {
        clearChildren(mountState);
        build(mountState);
      }
    },
    frame(frameState: EngineFrameState) {
      for (const draw of children) draw.frame?.(frameState, frameState.delta);
    },
    dispose(disposeState: EngineFrameState) {
      clearChildren(disposeState);
      disposeState.scene.remove(host);
      host.clear();
      geometry?.dispose();
      geometry = null;
    },
  };
}

export function InstancedBuildings(props: InstancedBuildingsProps) {
  const latest = useRef<InstancedBuildingsProps>(props);
  latest.current = props;
  return <EngineDrawMount create={() => instancedBuildingsDraw(() => latest.current)} deps={[]} />;
}
