import { useMemo } from "react";

import { generateBuildingDistrict } from "@jgengine/core/world/buildings";
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
import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";

import { GeneratedBuilding } from "../structures/GeneratedBuilding";
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
  return (
    <ProceduralGround
      terrain={{
        size: [terrain.bounds.w, terrain.bounds.d],
        height: terrain.height,
        seed: terrain.seed,
        moundScale: terrain.frequency ?? DEFAULT_TERRAIN_FREQUENCY,
        octaves: terrain.octaves,
        ridged: terrain.ridged,
        baseOffset: terrain.baseHeight,
      }}
      colors={terrain.waterLevel === undefined ? undefined : { waterlineHeight: terrain.waterLevel }}
    />
  );
}

function Vegetation({ grass, field }: { grass: GrassEnvironmentDescriptor; field: TerrainField }) {
  return (
    <GrassField
      area={[grass.area.w, grass.area.d]}
      density={grass.density}
      seed={grass.seed}
      bladeHeight={grass.bladeHeight}
      bladeWidth={grass.bladeWidth}
      heightAt={field.sampleHeight}
      colorBase={grass.colors[0]}
      colorTip={grass.colors[grass.colors.length - 1]}
      wind={{ strength: grass.windStrength }}
    />
  );
}

function weatherVolume(area: { w: number; d: number; h?: number }): readonly [number, number, number] {
  return [area.w, area.h ?? 60, area.d];
}

function Precipitation({ weather }: { weather: RainEnvironmentDescriptor | SnowEnvironmentDescriptor; index: number }) {
  if (weather.kind === "rain") {
    return (
      <RainField
        density={weather.density}
        speed={weather.speed}
        length={weather.dropLength}
        color={weather.color}
        wind={[weather.wind[0], 0, weather.wind[1]]}
        volume={weatherVolume(weather.area)}
      />
    );
  }
  return (
    <SnowField
      density={weather.density}
      speed={weather.speed}
      size={weather.flakeSize}
      sway={weather.drift}
      color={weather.color}
      wind={[weather.wind[0], 0, weather.wind[1]]}
      volume={weatherVolume(weather.area)}
    />
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
  return (
    <Ocean
      position-y={ocean.level}
      config={{
        size: Math.max(ocean.bounds.w, ocean.bounds.d),
        amplitude: ocean.waveHeight,
        speed: ocean.waveSpeed,
        color: { shallow: ocean.color },
      }}
    />
  );
}

function Structures({ structures }: { structures: BuildingEnvironmentDescriptor }) {
  const buildings = useMemo(() => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(structures.count)));
    const rows = Math.max(1, Math.ceil(structures.count / columns));
    const spacing = structures.spacing;
    const origin: readonly [number, number] = [
      -((columns - 1) * (structures.footprint.w + spacing)) / 2,
      -((rows - 1) * (structures.footprint.d + spacing)) / 2,
    ];
    return generateBuildingDistrict({
      rows,
      columns,
      origin,
      lotSize: structures.footprint,
      streetWidth: spacing,
      floorRange: structures.stories,
      base: { floorHeight: structures.storyHeight },
      ...(structures.seed === undefined ? {} : { seed: structures.seed }),
    }).slice(0, structures.count);
  }, [structures]);

  return (
    <>
      {buildings.map((building) => (
        <GeneratedBuilding key={building.id} building={building} />
      ))}
    </>
  );
}

export function EnvironmentScene({ feature }: EnvironmentSceneProps) {
  const field = useMemo(() => resolveTerrainField(feature.terrain), [feature.terrain]);
  const vegetation = feature.vegetation ?? [];
  const water = feature.water ?? [];
  const structures = feature.structures ?? [];
  return (
    <>
      {feature.terrain !== undefined ? <TerrainGround terrain={feature.terrain} /> : null}
      {water.map((ocean, index) => (
        <Water key={`ocean-${index}`} ocean={ocean} />
      ))}
      {structures.map((entry, index) => (
        <Structures key={`structures-${index}`} structures={entry} />
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
