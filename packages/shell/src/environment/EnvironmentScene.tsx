import { useMemo } from "react";

import { resolveBuildingPalette } from "@jgengine/core/world/buildings";
import { resolveStructureBuildings } from "@jgengine/core/world/environmentSummary";
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
import { resolveTerrainField, resolveTerrainPalette, type TerrainField } from "@jgengine/core/world/terrain";

import { SkyDaylight } from "./Daylight";
import { GroundPad } from "./GroundPad";
import { InstancedBuildings, type InstancedBuildingPlacement } from "../structures/GeneratedBuilding";
import { GrassField } from "../terrain/GrassField";
import { ProceduralGround } from "../terrain/ProceduralGround";
import { Ocean } from "../water/Ocean";
import { RainField } from "../weather/RainField";
import { SnowField } from "../weather/SnowField";
import { WeatherUniformProvider } from "../weather/weatherUniforms";

export interface EnvironmentSceneProps {
  feature: EnvironmentWorldFeature;
}

const DEFAULT_TERRAIN_FREQUENCY = 0.03;

function TerrainGround({ terrain }: { terrain: TerrainEnvironmentDescriptor }) {
  const palette = resolveTerrainPalette(terrain);
  return (
    <ProceduralGround
      terrain={{
        size: [terrain.bounds.w, terrain.bounds.d],
        segments: terrain.segments,
        height: terrain.height,
        seed: terrain.seed,
        moundScale: terrain.frequency ?? DEFAULT_TERRAIN_FREQUENCY,
        octaves: terrain.octaves,
        ridged: terrain.ridged,
        baseOffset: terrain.baseHeight,
      }}
      colors={{
        low: palette.low,
        high: palette.high,
        ...(terrain.waterLevel === undefined ? {} : { waterline: palette.waterline, waterlineHeight: terrain.waterLevel }),
      }}
    />
  );
}

function areaCenter(area: { position?: readonly [number, number] }): readonly [number, number] {
  return area.position ?? [0, 0];
}

function Vegetation({ grass, field }: { grass: GrassEnvironmentDescriptor; field: TerrainField }) {
  const [cx, cz] = areaCenter(grass.area);
  const heightAt = useMemo(
    () =>
      cx === 0 && cz === 0
        ? field.sampleHeight
        : (x: number, z: number) => field.sampleHeight(x + cx, z + cz),
    [cx, cz, field],
  );
  return (
    <group position={[cx, 0, cz]}>
      <GrassField
        area={[grass.area.w, grass.area.d]}
        density={grass.density}
        seed={grass.seed}
        bladeHeight={grass.bladeHeight}
        bladeWidth={grass.bladeWidth}
        heightAt={heightAt}
        colorBase={grass.colors[0]}
        colorTip={grass.colors[grass.colors.length - 1]}
        wind={{ strength: grass.windStrength }}
      />
    </group>
  );
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

function Water({ ocean }: { ocean: OceanEnvironmentDescriptor }) {
  const [x, z] = ocean.position ?? [0, 0];
  return (
    <Ocean
      position={[x, ocean.level, z]}
      config={{
        size: Math.max(ocean.bounds.w, ocean.bounds.d),
        amplitude: ocean.waveHeight,
        speed: ocean.waveSpeed,
        color: { shallow: ocean.color },
      }}
    />
  );
}

function Structures({ structures, field }: { structures: BuildingEnvironmentDescriptor; field: TerrainField }) {
  const placements = useMemo<InstancedBuildingPlacement[]>(
    () =>
      resolveStructureBuildings(structures).map((building) => ({
        building,
        position: [0, field.sampleHeight(building.center[0], building.center[1]), 0],
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
  const field = useMemo(() => resolveTerrainField(feature.terrain), [feature.terrain]);
  const vegetation = feature.vegetation ?? [];
  const water = feature.water ?? [];
  const structures = feature.structures ?? [];
  const pads = feature.pads ?? [];
  return (
    <>
      {feature.sky !== undefined && !feature.sky.timeOfDay ? <SkyDaylight sky={feature.sky} /> : null}
      {feature.terrain !== undefined ? <TerrainGround terrain={feature.terrain} /> : null}
      {water.map((ocean, index) => (
        <Water key={`ocean-${index}`} ocean={ocean} />
      ))}
      {structures.map((entry, index) => (
        <Structures key={`structures-${index}`} structures={entry} field={field} />
      ))}
      {pads.map((entry, index) => (
        <GroundPad key={`pad-${index}`} pad={entry} field={field} />
      ))}
      {vegetation.map((grass, index) => (
        <Vegetation key={`grass-${index}`} grass={grass} field={field} />
      ))}
      {feature.weather !== undefined && feature.weather.length > 0 ? (
        <Weather weather={feature.weather} />
      ) : null}
    </>
  );
}
