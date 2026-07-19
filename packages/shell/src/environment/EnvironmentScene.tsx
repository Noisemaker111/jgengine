import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { Group } from "three";
import { useGameContext } from "@jgengine/react/provider";

import { resolveBuildingPalette } from "@jgengine/core/world/buildings";
import { resolveStructureBuildings } from "@jgengine/core/world/environmentSummary";
import { findRoadJunctions, junctionExclusions } from "@jgengine/core/world/streets";
import type {
  BuildingEnvironmentDescriptor,
  EnvironmentWorldFeature,
  GrassEnvironmentDescriptor,
  OceanEnvironmentDescriptor,
  RainEnvironmentDescriptor,
  SnowEnvironmentDescriptor,
  TerrainEnvironmentDescriptor,
  WeatherEnvironmentDescriptor,
} from "@jgengine/core/world/features";
import {
  createTerrainPaletteSampler,
  resolveEnvironmentField,
  resolveTerrainDetail,
  resolveTerrainPalette,
  type ResolvedTerrainDetail,
  type TerrainField,
} from "@jgengine/core/world/terrain";

import { useDisposable } from "../render/useDisposable";
import { GroundPad } from "./GroundPad";
import { RoadJunctions } from "./RoadJunctions";
import { RoadRibbons } from "./RoadRibbons";
import { terrainGroundColorSampler } from "./terrainGroundColor";
import { InstancedBuildings, type InstancedBuildingPlacement } from "../structures/GeneratedBuilding";
import { GrassField } from "../terrain/GrassField";
import { CarvedTerrain, type CarvedTerrainProps } from "../terrain/CarvedTerrain";
import { createTerrainDetailMaterial } from "../terrain/terrainDetailMaterial";
import { Ocean } from "../water/Ocean";
import { RainField } from "../weather/RainField";
import { SnowField } from "../weather/SnowField";
import { WeatherUniformProvider } from "../weather/weatherUniforms";

export interface EnvironmentSceneProps {
  feature: EnvironmentWorldFeature;
}

interface TerrainGroundLayout {
  field: TerrainField;
  size: readonly [number, number];
  segments: TerrainEnvironmentDescriptor["segments"];
  colors: CarvedTerrainProps["colors"];
  heightRange: readonly [number, number];
  paletteAt: CarvedTerrainProps["paletteAt"];
  center?: readonly [number, number];
}

function TexturedTerrainGround({
  detail,
  layout,
}: {
  detail: ResolvedTerrainDetail;
  layout: TerrainGroundLayout;
}) {
  const maps = detail.material!.maps;
  const textures = useTexture({
    color: maps.color,
    normal: maps.normal,
    roughness: maps.roughness,
    ao: maps.ao,
  });
  useEffect(() => {
    textures.color.colorSpace = THREE.SRGBColorSpace;
    for (const texture of Object.values(textures)) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.needsUpdate = true;
    }
  }, [textures]);
  const material = useDisposable(() => createTerrainDetailMaterial(detail, textures).material, [detail, textures]);
  return (
    <CarvedTerrain
      field={layout.field}
      size={layout.size}
      segments={layout.segments}
      colors={layout.colors}
      heightRange={layout.heightRange}
      paletteAt={layout.paletteAt}
      center={layout.center}
      roughness={0.94}
      surfaceMaterial={material}
    />
  );
}

function TerrainGround({
  terrain,
  field,
  center,
}: {
  terrain: Omit<TerrainEnvironmentDescriptor, "kind">;
  field: TerrainField;
  center?: readonly [number, number];
}) {
  const palette = useMemo(() => resolveTerrainPalette(terrain), [terrain]);
  const paletteAt = useMemo(() => {
    const hasRegions = terrain.materialRegions !== undefined && terrain.materialRegions.length > 0;
    const hasBands = terrain.biomeBands !== undefined && terrain.biomeBands.length > 0;
    if (!hasRegions && !hasBands) return undefined;
    const sampler = createTerrainPaletteSampler(terrain);
    if (center === undefined) return sampler;
    return (x: number, z: number) => sampler(x - center[0], z - center[1]);
  }, [terrain, center]);
  const colors = useMemo(
    () => ({
      low: palette.low,
      high: palette.high,
      ...(terrain.waterLevel === undefined ? {} : { waterline: palette.waterline, waterlineHeight: terrain.waterLevel }),
    }),
    [palette, terrain.waterLevel],
  );
  const size = useMemo(() => [terrain.bounds.w, terrain.bounds.d] as const, [terrain.bounds]);
  const heightRange = useMemo(() => {
    const base = terrain.baseHeight ?? 0;
    const swing = terrain.height * 1.2;
    return [base - swing, base + swing] as const;
  }, [terrain.baseHeight, terrain.height]);
  const resolvedDetail = useMemo(
    () => (terrain.detail === undefined ? undefined : resolveTerrainDetail(terrain.detail, terrain.waterLevel)),
    [terrain.detail, terrain.waterLevel],
  );
  const proceduralMaterial = useMemo(
    () =>
      resolvedDetail === undefined || resolvedDetail.material !== undefined
        ? undefined
        : createTerrainDetailMaterial(resolvedDetail).material,
    [resolvedDetail],
  );
  useEffect(() => () => proceduralMaterial?.dispose(), [proceduralMaterial]);

  if (resolvedDetail?.material !== undefined) {
    return (
      <TexturedTerrainGround
        detail={resolvedDetail}
        layout={{ field, size, segments: terrain.segments, colors, heightRange, paletteAt, center }}
      />
    );
  }

  return (
    <CarvedTerrain
      field={field}
      size={size}
      segments={terrain.segments}
      colors={colors}
      heightRange={heightRange}
      paletteAt={paletteAt}
      center={center}
      roughness={0.94}
      surfaceMaterial={proceduralMaterial}
    />
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
  groundColor?: string;
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
  const wind = useMemo(() => ({ strength: grass.windStrength }), [grass.windStrength]);
  const colorBase = grass.colors[0];
  const colorTip = grass.colors[grass.colors.length - 1];
  return (
    <group position={[cx, 0, cz]}>
      <GrassField
        area={area}
        count={Math.max(1500, Math.min(250000, Math.ceil(grass.density * grass.area.w * grass.area.d)))}
        density={grass.density}
        seed={grass.seed}
        bladeHeight={grass.bladeHeight}
        bladeWidth={grass.bladeWidth}
        heightAt={heightAt}
        colorBase={colorBase}
        colorTip={colorTip}
        colorGround={groundColor}
        wind={wind}
        edgeFeather={Math.min(8, Math.max(1.5, Math.min(grass.area.w, grass.area.d) * 0.12))}
        frustumCulled
      />
    </group>
  );
}

/** Terrain color under a grass patch center — so blade roots blend into the ground they stand on. */
function vegetationGroundColor(
  terrain: Omit<TerrainEnvironmentDescriptor, "kind"> | undefined,
  field: TerrainField,
  grass: GrassEnvironmentDescriptor,
): string | undefined {
  const sampler = terrainGroundColorSampler(terrain, field);
  if (sampler === undefined) return undefined;
  const [cx, cz] = areaCenter(grass.area);
  return sampler(cx, cz);
}

function weatherVolume(area: { w: number; d: number; h?: number }): readonly [number, number, number] {
  return [area.w, area.h ?? 60, area.d];
}

function Precipitation({ weather }: { weather: RainEnvironmentDescriptor | SnowEnvironmentDescriptor; index: number }) {
  const [cx, cz] = areaCenter(weather.area);
  if (weather.kind === "rain") {
    return (
      <group position={[cx, 0, cz]}>
        <RainField
          density={weather.density}
          speed={weather.speed}
          length={weather.dropLength}
          width={weather.width}
          opacity={weather.opacity}
          color={weather.color}
          wind={[weather.wind[0], 0, weather.wind[1]]}
          volume={weatherVolume(weather.area)}
        />
      </group>
    );
  }
  return (
    <group position={[cx, 0, cz]}>
      <SnowField
        density={weather.density}
        speed={weather.speed}
        size={weather.flakeSize}
        sway={weather.drift}
        opacity={weather.opacity}
        color={weather.color}
        wind={[weather.wind[0], 0, weather.wind[1]]}
        volume={weatherVolume(weather.area)}
      />
    </group>
  );
}

function Weather({ weather }: { weather: readonly WeatherEnvironmentDescriptor[] }) {
  return (
    <WeatherUniformProvider>
      {weather.map((entry, index) => (
        <Precipitation key={`${entry.kind}-${index}`} weather={entry} index={index} />
      ))}
    </WeatherUniformProvider>
  );
}

function oceanConfig(ocean: OceanEnvironmentDescriptor) {
  return {
    size: ocean.bounds.w,
    depth: ocean.bounds.d,
    amplitude: ocean.waveHeight,
    speed: ocean.waveSpeed,
    waveScale: ocean.waveScale,
    color: { shallow: ocean.color },
  };
}

function useOceanConfig(ocean: OceanEnvironmentDescriptor) {
  return useMemo(
    () => oceanConfig(ocean),
    [ocean.bounds.w, ocean.bounds.d, ocean.waveHeight, ocean.waveSpeed, ocean.color],
  );
}

function DynamicWater({ ocean }: { ocean: OceanEnvironmentDescriptor & { levelAt: (time: number) => number } }) {
  const ctx = useGameContext();
  const groupRef = useRef<Group>(null);
  const [x, z] = ocean.position ?? [0, 0];
  const config = useOceanConfig(ocean);
  useFrame(() => {
    if (groupRef.current !== null) groupRef.current.position.y = ocean.levelAt(ctx.time.now());
  });
  return (
    <group ref={groupRef} position={[0, ocean.level, 0]}>
      <Ocean position={[x, 0, z]} config={config} />
    </group>
  );
}

function Water({ ocean }: { ocean: OceanEnvironmentDescriptor }) {
  const [x, z] = ocean.position ?? [0, 0];
  const config = useOceanConfig(ocean);
  if (ocean.levelAt !== undefined) {
    return <DynamicWater ocean={ocean as OceanEnvironmentDescriptor & { levelAt: (time: number) => number }} />;
  }
  return <Ocean position={[x, ocean.level, z]} config={config} />;
}

function Structures({ structures, field }: { structures: BuildingEnvironmentDescriptor; field: TerrainField }) {
  const placements = useMemo<InstancedBuildingPlacement[]>(
    () =>
      resolveStructureBuildings(structures).map((building) => ({
        building,
        position: [0, field.sampleHeight(building.center[0], building.center[1]), 0],
        ...(building.rotationY === undefined ? {} : { rotationY: building.rotationY, pivot: building.center }),
      })),
    [structures, field],
  );
  const palette = useMemo(
    () => resolveBuildingPalette(structures.style, structures.palette),
    [structures.style, structures.palette],
  );

  return <InstancedBuildings buildings={placements} palette={palette} />;
}

export function EnvironmentScene({ feature }: EnvironmentSceneProps) {
  const field = useMemo(() => resolveEnvironmentField(feature), [feature]);
  const vegetation = feature.vegetation ?? [];
  const water = feature.water ?? [];
  const structures = feature.structures ?? [];
  const pads = feature.pads ?? [];
  const islands = feature.islands ?? [];
  const roads = feature.roads ?? [];
  const junctions = useMemo(() => findRoadJunctions(roads), [roads]);
  const exclusions = useMemo(() => junctionExclusions(junctions), [junctions]);
  return (
    <>
      {feature.terrain !== undefined ? <TerrainGround terrain={feature.terrain} field={field} /> : null}
      {islands.map((entry, index) => (
        <TerrainGround key={`island-${index}`} terrain={entry} field={field} center={entry.origin} />
      ))}
      {water.map((ocean, index) => (
        <Water key={`ocean-${index}`} ocean={ocean} />
      ))}
      {roads.map((entry, index) => (
        <RoadRibbons key={`road-${index}`} road={entry} field={field} exclusions={exclusions} />
      ))}
      <RoadJunctions junctions={junctions} field={field} />
      {structures.map((entry, index) => (
        <Structures key={`structures-${index}`} structures={entry} field={field} />
      ))}
      {pads.map((entry, index) => (
        <GroundPad key={`pad-${index}`} pad={entry} field={field} />
      ))}
      {vegetation.map((grass, index) => (
        <Vegetation
          key={`grass-${index}`}
          grass={grass}
          field={field}
          groundColor={vegetationGroundColor(feature.terrain, field, grass)}
        />
      ))}
      {feature.weather !== undefined && feature.weather.length > 0 ? (
        <Weather weather={feature.weather} />
      ) : null}
    </>
  );
}
