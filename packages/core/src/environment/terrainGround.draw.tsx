import * as THREE from "three";

import type { TerraformSnapshot } from "@jgengine/core/terrain/terraform";
import { editableTerrainFromSnapshot } from "@jgengine/core/terrain/terraform";
import { createTerrainPaintColorSampler } from "@jgengine/core/terrain/terrainPaintColor.draw";
import {
  createTerrainPaletteSampler,
  resolveTerrainDetail,
  resolveTerrainPalette,
  type ResolvedTerrainDetail,
  type TerrainField,
} from "@jgengine/core/terrain/terrain";
import { createTerrainDetailMaterial } from "@jgengine/core/terrain/terrainDetailMaterial.draw";
import { createTerrainSurfacesDriver, type TerrainSurfacesSnapshot } from "@jgengine/core/terrain/terrainSurfacesDriver.draw";
import { createTolerantTerrainMaterialDriver } from "@jgengine/core/terrain/tolerantTerrainMaterial.draw";
import { terrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { createTerrainPaintTextures, packTerrainPaintWeights, type TerrainPaintTextures } from "@jgengine/core/terrain/terrainSurfaces.draw";
import type { TerrainEnvironmentDescriptor } from "@jgengine/core/world/features";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

import { carvedTerrainDraw, type CarvedTerrainProps } from "@jgengine/core/terrain/CarvedTerrain.draw";

/** Props for {@link terrainGroundDraw}: the terrain descriptor, live field, optional island center and sculpt snapshot. */
export interface TerrainGroundDrawProps {
  terrain: Omit<TerrainEnvironmentDescriptor, "kind">;
  field: TerrainField;
  center?: readonly [number, number] | undefined;
  sculpt?: TerraformSnapshot | undefined;
}

interface DerivedGround {
  paint: TerrainPaintTextures | undefined;
  paintColorAt: CarvedTerrainProps["paintColorAt"];
  paletteAt: CarvedTerrainProps["paletteAt"];
  colors: NonNullable<CarvedTerrainProps["colors"]>;
  size: readonly [number, number];
  heightRange: readonly [number, number];
  resolvedDetail: ResolvedTerrainDetail | undefined;
}

function deriveGround(props: TerrainGroundDrawProps): DerivedGround {
  const { terrain, center, sculpt } = props;
  const detailEnabled = terrain.detail !== false;
  const paint =
    !detailEnabled || sculpt === undefined
      ? undefined
      : (() => {
          const weights = packTerrainPaintWeights(editableTerrainFromSnapshot(sculpt));
          return weights === undefined ? undefined : createTerrainPaintTextures(weights);
        })();
  const paintColorAt =
    detailEnabled || sculpt === undefined ? undefined : createTerrainPaintColorSampler(editableTerrainFromSnapshot(sculpt));
  const palette = resolveTerrainPalette(terrain);
  const paletteAt = (() => {
    const hasRegions = terrain.materialRegions !== undefined && terrain.materialRegions.length > 0;
    const hasBands = terrain.biomeBands !== undefined && terrain.biomeBands.length > 0;
    if (!hasRegions && !hasBands) return undefined;
    const sampler = createTerrainPaletteSampler(terrain);
    if (center === undefined) return sampler;
    return (x: number, z: number) => sampler(x - center[0], z - center[1]);
  })();
  const colors = {
    low: palette.low,
    high: palette.high,
    ...(terrain.waterLevel === undefined ? {} : { waterline: palette.waterline, waterlineHeight: terrain.waterLevel }),
  };
  const base = terrain.baseHeight ?? 0;
  const swing = terrain.height * 1.2;
  return {
    paint,
    paintColorAt,
    paletteAt,
    colors,
    size: [terrain.bounds.w, terrain.bounds.d],
    heightRange: [base - swing, base + swing],
    resolvedDetail: terrain.detail === false ? undefined : resolveTerrainDetail(terrain.detail, terrain.waterLevel),
  };
}

/**
 * Terrain ground as an {@link EngineDraw}: derives paint/palette/detail inputs, runs the surface
 * bake and tolerant map loads through draw-side drivers, and feeds the current material into an
 * inner {@link carvedTerrainDraw}. `missing === "fail"` descriptors stay on the React
 * `TexturedTerrainGround` path — the draw never sees them.
 * @internal
 */
export function terrainGroundDraw(getProps: () => TerrainGroundDrawProps): EngineDraw {
  const group = new THREE.Group();
  const carvedProps: CarvedTerrainProps = { field: getProps().field, roughness: 0.94 };
  let inner: EngineDraw | null = null;
  let innerState: EngineFrameState | null = null;

  let derivedFor: { terrain: unknown; center: unknown; sculpt: unknown } | null = null;
  let derived: DerivedGround | null = null;
  let surfacesDriver: ReturnType<typeof createTerrainSurfacesDriver> | null = null;
  let tolerantDriver: ReturnType<typeof createTolerantTerrainMaterialDriver> | null = null;
  let surfacesSnap: TerrainSurfacesSnapshot = { surfaces: undefined, pending: false };
  let proceduralMaterial: THREE.Material | undefined;
  let proceduralSignature: readonly unknown[] | null = null;
  let mountedState: EngineFrameState | null = null;

  const recompute = () => {
    const props = getProps();
    derivedFor = { terrain: props.terrain, center: props.center, sculpt: props.sculpt };
    derived?.paint?.dispose();
    derived = deriveGround(props);
    surfacesDriver?.dispose();
    tolerantDriver?.dispose();
    surfacesDriver = createTerrainSurfacesDriver(
      () => ({
        detailSurfaces: derived?.resolvedDetail?.surfaces,
        paintSlots: derived?.paint?.slots,
        quality: terrainQuality(),
      }),
      () => mountedState?.invalidate(),
    );
    tolerantDriver = createTolerantTerrainMaterialDriver(
      () => ({
        detail:
          derived?.resolvedDetail?.material !== undefined && derived.resolvedDetail.material.missing !== "fail"
            ? derived.resolvedDetail
            : undefined,
        paint: derived?.paint,
        surfaces: surfacesSnap.surfaces,
      }),
      () => mountedState?.invalidate(),
    );
    proceduralMaterial?.dispose();
    proceduralMaterial = undefined;
    proceduralSignature = null;
  };

  const sync = () => {
    const props = getProps();
    if (
      derivedFor === null ||
      props.terrain !== derivedFor.terrain ||
      props.center !== derivedFor.center ||
      props.sculpt !== derivedFor.sculpt
    ) {
      recompute();
    }
    const d = derived;
    if (d === null || surfacesDriver === null || tolerantDriver === null) return;
    surfacesSnap = surfacesDriver.sync();
    const tolerantMaterial = tolerantDriver.sync();
    const quality = terrainQuality();
    const detail = d.resolvedDetail;
    const wantsProcedural =
      detail !== undefined &&
      !surfacesSnap.pending &&
      !(detail.material !== undefined && detail.material.missing === "fail");
    const signature: readonly unknown[] = [detail, surfacesSnap.pending, d.paint, quality, surfacesSnap.surfaces];
    if (wantsProcedural && detail !== undefined) {
      if (proceduralSignature === null || signature.some((value, index) => value !== proceduralSignature![index])) {
        proceduralMaterial?.dispose();
        proceduralMaterial = createTerrainDetailMaterial(detail, undefined, {
          paint: d.paint,
          quality,
          surfaces: surfacesSnap.surfaces,
        }).material;
        proceduralSignature = signature;
      }
    } else if (proceduralMaterial !== undefined) {
      proceduralMaterial.dispose();
      proceduralMaterial = undefined;
      proceduralSignature = null;
    }
    carvedProps.field = props.field;
    carvedProps.size = d.size;
    carvedProps.segments = props.terrain.segments;
    carvedProps.colors = d.colors;
    carvedProps.heightRange = d.heightRange;
    carvedProps.paletteAt = d.paletteAt;
    carvedProps.paintColorAt = d.paintColorAt;
    carvedProps.center = props.center;
    carvedProps.surfaceMaterial = tolerantMaterial ?? proceduralMaterial;
  };

  return {
    mount(state: EngineFrameState) {
      mountedState = state;
      sync();
      const draw = carvedTerrainDraw(() => carvedProps);
      const childState = childFrameState(state, group);
      draw.mount?.(childState);
      inner = draw;
      innerState = childState;
      state.scene.add(group);
    },
    frame(state: EngineFrameState) {
      sync();
      if (inner !== null && innerState !== null) inner.frame?.(childFrameState(state, group), state.delta);
    },
    update(state: EngineFrameState) {
      sync();
      if (inner !== null && innerState !== null) inner.update?.(childFrameState(state, group));
    },
    dispose(state: EngineFrameState) {
      mountedState = null;
      surfacesDriver?.dispose();
      surfacesDriver = null;
      tolerantDriver?.dispose();
      tolerantDriver = null;
      proceduralMaterial?.dispose();
      proceduralMaterial = undefined;
      proceduralSignature = null;
      derived?.paint?.dispose();
      derived = null;
      derivedFor = null;
      surfacesSnap = { surfaces: undefined, pending: false };
      if (inner !== null && innerState !== null) inner.dispose?.(innerState);
      inner = null;
      innerState = null;
      state.scene.remove(group);
      group.clear();
    },
  };
}
