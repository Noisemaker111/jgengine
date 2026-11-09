import { useRef } from "react";
import { DoubleSide, Group, MeshStandardMaterial, type BufferGeometry } from "three";
import type { RoadRibbon } from "@jgengine/core/roads/roads";
import type { TerrainDetailMaterialConfig } from "@jgengine/core/world/features";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { terrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import type { SurfaceScanTextures } from "@jgengine/core/material/surfaceScanTextures.draw";
import { scannedRibbonDraw, type ScannedRibbonSpec, type SurfaceRibbonMaterialOptions } from "./surfaceRibbonMaterial.draw";
import { mergeRibbonGeometry, type JunctionSurface } from "./RoadRibbons.draw";

/** Stop-line and crosswalk paint tone. @internal */
export const JUNCTION_PAINT = "#e6e9ee";

interface JunctionPatchProps {
  geometry: BufferGeometry;
  color: string;
  surfaceDetail: boolean;
  surface: string;
  scan: TerrainDetailMaterialConfig | undefined;
}

/** One welded crossing surface, shaded like the carriageway ribbons. */
function junctionPatchDraw(getProps: () => JunctionPatchProps): EngineDraw {
  return scannedRibbonDraw((): ScannedRibbonSpec => {
    const props = getProps();
    const quality = terrainQuality();
    return {
      geometry: props.geometry,
      scanMaps: props.scan?.maps,
      scanEnabled: props.surfaceDetail && quality !== "low",
      quality,
      materialOptions: (textures: SurfaceScanTextures | null): SurfaceRibbonMaterialOptions | null =>
        props.surfaceDetail
          ? {
              surface: props.surface,
              color: props.color,
              halfWidth: 1,
              quality,
              ...(props.scan === undefined || textures === null
                ? {}
                : { scan: { textures, projection: "world" as const, repeat: props.scan.repeat ?? 4, strength: props.scan.strength ?? 1, tint: props.scan.tint ?? 1 } }),
            }
          : null,
      fallback: () => new MeshStandardMaterial({ color: props.color, roughness: 0.95, metalness: 0, side: DoubleSide }),
      receiveShadow: true,
    };
  });
}

interface JunctionPaintProps {
  geometry: BufferGeometry;
  surfaceDetail: boolean;
  scan: TerrainDetailMaterialConfig | undefined;
}

/** White stop-line / crosswalk paint over a junction: worn through to the asphalt grain like the lane dashes. */
function junctionPaintDraw(getProps: () => JunctionPaintProps): EngineDraw {
  return scannedRibbonDraw((): ScannedRibbonSpec => {
    const props = getProps();
    const quality = terrainQuality();
    return {
      geometry: props.geometry,
      scanMaps: props.scan?.maps,
      scanEnabled: props.surfaceDetail && quality !== "low",
      quality,
      materialOptions: (textures: SurfaceScanTextures | null): SurfaceRibbonMaterialOptions | null =>
        props.surfaceDetail
          ? {
              surface: "road",
              color: JUNCTION_PAINT,
              halfWidth: 0.3,
              roughness: 0.6,
              quality,
              polygonOffset: true,
              paint: true,
              ...(props.scan === undefined || textures === null
                ? {}
                : { scan: { textures, projection: "world" as const, repeat: props.scan.repeat ?? 4, strength: 0.85, tint: 0 } }),
            }
          : null,
      fallback: () =>
        new MeshStandardMaterial({
          color: JUNCTION_PAINT,
          roughness: 0.85,
          metalness: 0,
          side: DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      receiveShadow: true,
      renderOrder: 1,
    };
  });
}

/**
 * Junction surfaces merged per colour, so every crossing of one colour is one draw. @internal
 */
export function mergeJunctionSurfaces(surfaces: readonly JunctionSurface[]): { color: string; geometry: BufferGeometry }[] {
  const byColor = new Map<string, RoadRibbon[]>();
  for (const surface of surfaces) {
    const ribbons = byColor.get(surface.color);
    if (ribbons === undefined) byColor.set(surface.color, [surface.ribbon]);
    else ribbons.push(surface.ribbon);
  }
  const patches: { color: string; geometry: BufferGeometry }[] = [];
  for (const [color, ribbons] of byColor) {
    const geometry = mergeRibbonGeometry(ribbons);
    if (geometry !== null) patches.push({ color, geometry });
  }
  return patches;
}

/** Props for {@link RoadJunctions}. */
export interface RoadJunctionsProps {
  surfaces: readonly JunctionSurface[];
  /** Stop-line and crosswalk ribbons from `buildAuthoredRoadNetwork`. */
  paint: readonly RoadRibbon[];
  /** Shade the welded surfaces with the asphalt procedural surface, matching the ribbons. Default true. */
  surfaceDetail?: boolean;
  /** Surface the welded crossings shade with, as the roads meeting there do. Default `"road"`. */
  surface?: string;
  /** Scanned carriageway from the first road that names one, so junctions match the ribbons. */
  scan?: TerrainDetailMaterialConfig | undefined;
}

/**
 * Renders welded road intersections: one seam-shared asphalt surface per junction (built by
 * {@link buildAuthoredRoadNetwork}, its boundary vertices welded onto the trimmed ribbon ends so
 * there is no overlap and no floating disc), plus white stop lines and crosswalk bars at each
 * approach. Junctions of one colour share one draw. Markings ride the `GROUND_DECAL_LAYERS` marking
 * layer above the surface, with `polygonOffset`/`renderOrder` so they win the depth test on sloped ground.
 * @internal
 */
export function roadJunctionsDraw(getProps: () => RoadJunctionsProps): EngineDraw {
  const group = new Group();
  let children: { draw: EngineDraw; state: EngineFrameState }[] = [];
  let geometries: BufferGeometry[] = [];
  let added = false;
  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      const patches = mergeJunctionSurfaces(props.surfaces);
      const markings = mergeRibbonGeometry(props.paint);
      if (patches.length === 0 && markings === null) return;
      const surfaceDetail = props.surfaceDetail ?? true;
      const surface = props.surface ?? "road";
      const scan = props.scan;
      children = [];
      geometries = [];
      const add = (draw: EngineDraw) => {
        const childState = childFrameState(state, group);
        draw.mount?.(childState);
        children.push({ draw, state: childState });
      };
      for (const patch of patches) {
        geometries.push(patch.geometry);
        add(junctionPatchDraw(() => ({ geometry: patch.geometry, color: patch.color, surfaceDetail, surface, scan })));
      }
      if (markings !== null) {
        geometries.push(markings);
        add(junctionPaintDraw(() => ({ geometry: markings, surfaceDetail, scan })));
      }
      state.scene.add(group);
      added = true;
    },
    frame(_state: EngineFrameState) {
      for (const child of children) child.draw.frame?.(child.state);
    },
    dispose(state: EngineFrameState) {
      for (const child of children) child.draw.dispose?.(child.state);
      children = [];
      if (added) state.scene.remove(group);
      added = false;
      for (const geometry of geometries) geometry.dispose();
      geometries = [];
    },
  };
}

/**
 * Renders welded road intersections: one seam-shared asphalt surface per junction (built by
 * {@link buildAuthoredRoadNetwork}, its boundary vertices welded onto the trimmed ribbon ends so
 * there is no overlap and no floating disc), plus white stop lines and crosswalk bars at each
 * approach. Junctions of one colour share one draw. Markings ride the `GROUND_DECAL_LAYERS` marking
 * layer above the surface, with `polygonOffset`/`renderOrder` so they win the depth test on sloped ground.
 * @internal
 */
export function RoadJunctions(props: RoadJunctionsProps) {
  const latest = useRef<RoadJunctionsProps>(props);
  latest.current = props;
  useEngineDraw(() => roadJunctionsDraw(() => latest.current), [props.surfaces, props.paint, props.surfaceDetail, props.surface, props.scan]);
  return null;
}
