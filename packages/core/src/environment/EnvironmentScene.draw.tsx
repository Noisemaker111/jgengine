/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { oceanColor } from "@jgengine/core/water/oceanColor";
import { waterSurfaceConfigFromDescriptor } from "@jgengine/core/water/waterSurface";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "@jgengine/core/ui/jsx";
import { PresentationAssetBoundary } from "@jgengine/shell/presentationRecovery";
import { PresentationRecoveredDraw } from "@jgengine/shell/presentationRecovery3d";
import { usePresentationRetryScope } from "@jgengine/shell/presentationRecovery";
import * as THREE from "three";
import { useGameContext } from "@jgengine/ui/provider";

import { resolveBuildingPalette } from "@jgengine/core/buildings/buildings";
import { resolveStructureBuildings } from "@jgengine/core/world/environmentSummary";
import type {
  BuildingEnvironmentDescriptor,
  EnvironmentWorldFeature,
  GrassEnvironmentDescriptor,
  OceanEnvironmentDescriptor,
  RainEnvironmentDescriptor,
  RoadEnvironmentDescriptor,
  SnowEnvironmentDescriptor,
  TerrainEnvironmentDescriptor,
  WeatherEnvironmentDescriptor,
  WorldBounds,
} from "@jgengine/core/world/features";
import {
  resolveEnvironmentField,
  resolveTerrainDetail,
  type TerrainField,
} from "@jgengine/core/terrain/terrain";

import type { TerraformSnapshot } from "@jgengine/core/terrain/terraform";
import { GroundPad } from "./GroundPad.draw";
import { Roads } from "@jgengine/core/roads/RoadRibbons.draw";
import { terrainGroundColorSampler } from "@jgengine/core/terrain/terrainGroundColor.draw";
import { InstancedBuildings, type InstancedBuildingPlacement } from "@jgengine/core/buildings/GeneratedBuilding.draw";
import { GrassPatch } from "@jgengine/core/grass/GrassPatch.draw";
import { terrainGroundDraw, type TerrainGroundDrawProps } from "./terrainGround.draw";
import { EngineDrawMount, SceneObjectGroup, SceneObjectPortal, sceneObjectAttachDraw, useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { Ocean } from "@jgengine/core/water/Ocean.draw";
import { oceanBedBounds } from "@jgengine/core/water/oceanBed";
import { RainField } from "@jgengine/core/weather/RainField.draw";
import { SnowField } from "@jgengine/core/weather/SnowField.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

/** Props for {@link EnvironmentScene}: the environment world feature to draw. */
export interface EnvironmentSceneProps {
  feature: EnvironmentWorldFeature;
}

function TerrainGround({
  terrain,
  field,
  center,
  sculpt,
}: {
  terrain: Omit<TerrainEnvironmentDescriptor, "kind">;
  field: TerrainField;
  center?: readonly [number, number] | undefined;
  sculpt?: TerraformSnapshot | undefined;
}) {
  const detail = useMemo(
    () => (terrain.detail === false ? undefined : resolveTerrainDetail(terrain.detail, terrain.waterLevel)),
    [terrain.detail, terrain.waterLevel],
  );
  const required = detail?.material?.missing === "fail";
  const scope = usePresentationRetryScope();
  const latest = useRef<TerrainGroundDrawProps>({ terrain, field, center, sculpt });
  latest.current = {
    terrain,
    field,
    center,
    sculpt,
    onAssetFail: (error) => scope?.fail(error),
  };
  return (
    <PresentationAssetBoundary>
      {required ? <PresentationRecoveredDraw /> : null}
      <EngineDrawMount create={() => terrainGroundDraw(() => latest.current)} deps={[]} />
    </PresentationAssetBoundary>
  );
}

function areaCenter(area: { position?: readonly [number, number] }): readonly [number, number] {
  return area.position ?? [0, 0];
}

function Vegetation({
  grass,
  field,
  groundColor,
}: {
  grass: GrassEnvironmentDescriptor;
  field: TerrainField;
  groundColor?: string | undefined;
}) {
  const [cx, cz] = areaCenter(grass.area);
  const heightAt = useMemo(
    () =>
      cx === 0 && cz === 0
        ? field.sampleHeight
        : (x: number, z: number) => field.sampleHeight(x + cx, z + cz),
    [cx, cz, field],
  );
  const area = useMemo(() => [grass.area.w, grass.area.d] as const, [grass.area.w, grass.area.d]);
  return (
    <GrassPatch position={[cx, 0, cz]} look={grass.look} area={area} heightAt={heightAt} groundColor={groundColor} />
  );
}

/** Terrain color under a grass patch center — so blade roots blend into the ground they stand on. */
function vegetationGroundColor(
  terrain: Omit<TerrainEnvironmentDescriptor, "kind"> | undefined,
  field: TerrainField,
  grass: GrassEnvironmentDescriptor,
  sculpt?: TerraformSnapshot,
): string | undefined {
  const sampler = terrainGroundColorSampler(terrain, field, sculpt);
  if (sampler === undefined) return undefined;
  const [cx, cz] = areaCenter(grass.area);
  return sampler(cx, cz);
}

function weatherVolume(area: { w: number; d: number; h?: number }): readonly [number, number, number] {
  return [area.w, area.h ?? 60, area.d];
}

function Precipitation({ weather }: { weather: RainEnvironmentDescriptor | SnowEnvironmentDescriptor; index: number }) {
  const ctx = useGameContext();
  const [cx, cz] = areaCenter(weather.area);
  if (weather.kind === "rain") {
    return (
      <SceneObjectGroup position={[cx, 0, cz]}>
        <RainField
          timeSeconds={ctx.time.now}
          density={weather.density}
          speed={weather.speed}
          length={weather.dropLength}
          width={weather.width}
          opacity={weather.opacity}
          color={weather.color}
          wind={[weather.wind[0], 0, weather.wind[1]]}
          volume={weatherVolume(weather.area)}
        />
      </SceneObjectGroup>
    );
  }
  return (
    <SceneObjectGroup position={[cx, 0, cz]}>
      <SnowField
        timeSeconds={ctx.time.now}
        density={weather.density}
        speed={weather.speed}
        size={weather.flakeSize}
        sway={weather.drift}
        opacity={weather.opacity}
        color={weather.color}
        wind={[weather.wind[0], 0, weather.wind[1]]}
        volume={weatherVolume(weather.area)}
      />
    </SceneObjectGroup>
  );
}

function Weather({ weather }: { weather: readonly WeatherEnvironmentDescriptor[] }) {
  return (
    <>
      {weather.map((entry, index) => (
        <Precipitation key={`${entry.kind}-${index}`} weather={entry} index={index} />
      ))}
    </>
  );
}

function oceanConfig(ocean: OceanEnvironmentDescriptor) {
  return {
    size: ocean.bounds.w,
    depth: ocean.bounds.d,
    ...(ocean.horizon === true ? { follow: true, quality: "high" as const } : {}),
    ...(ocean.bedResolution === undefined ? {} : { bedResolution: ocean.bedResolution }),
    waves: waterSurfaceConfigFromDescriptor(ocean),
    color: oceanColor(ocean),
  };
}

function useOceanConfig(ocean: OceanEnvironmentDescriptor) {
  return useMemo(
    () => oceanConfig(ocean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ocean.bounds.w, ocean.bounds.d, ocean.waveHeight, ocean.waveSpeed, ocean.waveScale, ocean.color, ocean.palette?.deep, ocean.palette?.crest, ocean.palette?.foam, ocean.palette?.fresnel, ocean.horizon, ocean.clarity, ocean.bedResolution],
  );
}

function useOceanBed(ocean: OceanEnvironmentDescriptor, terrain: WorldBounds | undefined) {
  const ctx = useGameContext();
  const [x, z] = ocean.position ?? [0, 0];
  // The descriptor has no bed of its own: the live ground under the sheet is the bed, so it shades
  // shallow to deep and foams where the ground meets the surface, at any water level.
  const bedAt = useCallback((lx: number, lz: number) => ctx.world.ground.sampleHeight(x + lx, z + lz), [ctx.world.ground, x, z]);
  const bounds = useMemo(() => oceanBedBounds(ocean, terrain), [ocean.bounds.w, ocean.bounds.d, x, z, terrain?.w, terrain?.d]);
  return { bedAt, bounds };
}

function DynamicWater({ ocean, terrain }: { ocean: OceanEnvironmentDescriptor & { levelAt: (time: number) => number }; terrain: WorldBounds | undefined }) {
  const ctx = useGameContext();
  const [x, z] = ocean.position ?? [0, 0];
  const config = useOceanConfig(ocean);
  const { bedAt, bounds } = useOceanBed(ocean, terrain);
  const group = useMemo(() => {
    const next = new THREE.Group();
    next.position.set(0, ocean.level, 0);
    return next;
  }, [ocean.level]);
  useEngineDraw(() => sceneObjectAttachDraw(group, true), [group]);
  useFrameTask(() => {
    group.position.y = ocean.levelAt(ctx.time.now());
  });
  return (
    <SceneObjectPortal object={group}>
      <Ocean position={[x, 0, z]} config={config} bedAt={bedAt} bedBounds={bounds} />
    </SceneObjectPortal>
  );
}

function Water({ ocean, terrain }: { ocean: OceanEnvironmentDescriptor; terrain: WorldBounds | undefined }) {
  const [x, z] = ocean.position ?? [0, 0];
  const config = useOceanConfig(ocean);
  const { bedAt, bounds } = useOceanBed(ocean, terrain);
  if (ocean.levelAt !== undefined) {
    return <DynamicWater ocean={ocean as OceanEnvironmentDescriptor & { levelAt: (time: number) => number }} terrain={terrain} />;
  }
  return <Ocean position={[x, ocean.level, z]} config={config} bedAt={bedAt} bedBounds={bounds} />;
}

function Structures({
  structures,
  field,
  roads,
}: {
  structures: BuildingEnvironmentDescriptor;
  field: TerrainField;
  roads: readonly RoadEnvironmentDescriptor[];
}) {
  const placements = useMemo<InstancedBuildingPlacement[]>(
    () =>
      resolveStructureBuildings(structures, roads).map((building) => ({
        building,
        position: [0, field.sampleHeight(building.center[0], building.center[1]), 0],
        ...(building.rotationY === undefined ? {} : { rotationY: building.rotationY, pivot: building.center }),
      })),
    [structures, field, roads],
  );
  const palette = useMemo(
    () => resolveBuildingPalette(structures.style, structures.palette),
    [structures.style, structures.palette],
  );

  return (
    <InstancedBuildings
      buildings={placements}
      palette={palette}
      {...(structures.kit === undefined ? {} : { kit: structures.kit })}
    />
  );
}

const NO_ROADS: readonly RoadEnvironmentDescriptor[] = [];
const NO_SUBSCRIPTION = () => () => {};

/** The roads to draw: the live source when the world declares one, else the boot list. */
function useLiveRoads(feature: EnvironmentWorldFeature): readonly RoadEnvironmentDescriptor[] {
  const source = feature.roadSource;
  const fallback = feature.roads ?? NO_ROADS;
  const subscribe = useCallback(
    (listener: () => void) => (source === undefined ? NO_SUBSCRIPTION() : source.subscribe(listener)),
    [source],
  );
  const read = useCallback(() => (source === undefined ? fallback : source.current()), [source, fallback]);
  return useSyncExternalStore(subscribe, read, read);
}

/** Draw an environment world feature: its sky, ground (terrain, pad or plane), water, weather and lighting. */
export function EnvironmentScene({ feature }: EnvironmentSceneProps) {
  const field = useMemo(() => resolveEnvironmentField(feature), [feature]);
  const vegetation = feature.vegetation ?? [];
  const water = feature.water ?? [];
  const structures = feature.structures ?? [];
  const pads = feature.pads ?? [];
  const islands = feature.islands ?? [];
  const roads = useLiveRoads(feature);
  return (
    <>
      {feature.terrain !== undefined ? <TerrainGround terrain={feature.terrain} field={field} sculpt={feature.sculpt} /> : null}
      {islands.map((entry, index) => (
        <TerrainGround key={`island-${index}`} terrain={entry} field={field} center={entry.origin} sculpt={feature.sculpt} />
      ))}
      {water.map((ocean, index) => (
        <Water key={`ocean-${index}`} ocean={ocean} terrain={feature.terrain?.bounds} />
      ))}
      <Roads roads={roads} field={field} />
      {structures.map((entry, index) => (
        <Structures key={`structures-${index}`} structures={entry} field={field} roads={roads} />
      ))}
      {pads.map((entry, index) => (
        <GroundPad key={`pad-${index}`} pad={entry} field={field} />
      ))}
      {vegetation.map((grass, index) => (
        <Vegetation
          key={`grass-${index}`}
          grass={grass}
          field={field}
          groundColor={vegetationGroundColor(feature.terrain, field, grass, feature.sculpt)}
        />
      ))}
      {feature.weather !== undefined && feature.weather.length > 0 ? (
        <Weather weather={feature.weather} />
      ) : null}
    </>
  );
}
