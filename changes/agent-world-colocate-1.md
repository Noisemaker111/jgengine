Sky, water, grass and weather each live in one `@jgengine/core` folder, model and draw together (`name.ts` model, `name.draw.tsx` three.js).

### Migrate
- `@jgengine/shell/grass/GrassCover` → `@jgengine/core/grass/GrassCover.draw`
- `@jgengine/shell/scene/GrassFieldRenderer` → `@jgengine/core/grass/GrassFieldRenderer.draw`
- `@jgengine/shell/grass/GrassPatch` → `@jgengine/core/grass/GrassPatch.draw`
- `@jgengine/shell/grass/grassBake` → `@jgengine/core/grass/grassBake.draw`
- `@jgengine/shell/grass/grassCoverGeometry` → `@jgengine/core/grass/grassCoverGeometry.draw`
- `@jgengine/core/world/grassKind` → `@jgengine/core/grass/grassKind`
- `@jgengine/shell/grass/grassMaterial` → `@jgengine/core/grass/grassMaterial.draw`
- `@jgengine/shell/grass/grassStream` → `@jgengine/core/grass/grassStream.draw`
- `@jgengine/shell/sky/Daylight` → `@jgengine/core/sky/Daylight.draw`
- `@jgengine/shell/sky/VolumetricClouds` → `@jgengine/core/sky/VolumetricClouds.draw`
- `@jgengine/shell/sky/skyBands` → `@jgengine/core/sky/skyBands`
- `@jgengine/shell/sky/skyLightingPolicy` → `@jgengine/core/sky/skyLightingPolicy`
- `@jgengine/shell/sky/skySun` → `@jgengine/core/sky/skySun.draw`
- `@jgengine/shell/sky/sunShadowMath` → `@jgengine/core/sky/sunShadowMath`
- `@jgengine/shell/water/Ocean` → `@jgengine/core/water/Ocean.draw`
- `@jgengine/shell/water/OceanConfig` → `@jgengine/core/water/OceanConfig.draw`
- `@jgengine/shell/water/OceanMaterial` → `@jgengine/core/water/OceanMaterial.draw`
- `@jgengine/shell/water/OceanShader` → `@jgengine/core/water/OceanShader`
- `@jgengine/shell/water/WaterRenderer` → `@jgengine/core/water/WaterRenderer.draw`
- `@jgengine/shell/water/oceanColor` → `@jgengine/core/water/oceanColor`
- `@jgengine/shell/weather/AuthoredWeatherLayer` → `@jgengine/core/weather/AuthoredWeatherLayer.draw`
- `@jgengine/shell/weather/DustField` → `@jgengine/core/weather/DustField.draw`
- `@jgengine/shell/weather/FireSpreadLayer` → `@jgengine/core/weather/FireSpreadLayer.draw`
- `@jgengine/shell/weather/LightningStrike` → `@jgengine/core/weather/LightningStrike.draw`
- `@jgengine/shell/weather/RainField` → `@jgengine/core/weather/RainField.draw`
- `@jgengine/shell/weather/RainImpactField` → `@jgengine/core/weather/RainImpactField.draw`
- `@jgengine/shell/weather/SnowField` → `@jgengine/core/weather/SnowField.draw`
- `@jgengine/shell/weather/WeatherLayer` → `@jgengine/core/weather/WeatherLayer.draw`
- `@jgengine/core/world/authoredWeather` → `@jgengine/core/weather/authoredWeather`
- `@jgengine/shell/weather/fireSpreadPose` → `@jgengine/core/weather/fireSpreadPose.draw`
- `@jgengine/core/world/weather` → `@jgengine/core/weather/weather`
- `@jgengine/shell/weather/weatherGeometry` → `@jgengine/core/weather/weatherGeometry.draw`
- `@jgengine/shell/weather/weatherMath` → `@jgengine/core/weather/weatherMath`
- `@jgengine/shell/weather/weatherShelter` → `@jgengine/core/weather/weatherShelter.draw`
- `@jgengine/shell/weather/weatherUniforms` → `@jgengine/core/weather/weatherUniforms.draw`

- `@jgengine/shell/weather` and `@jgengine/shell/water` are gone: import each name from its core file above (`WeatherLayer` from `@jgengine/core/weather/WeatherLayer.draw`, `Ocean` from `@jgengine/core/water/Ocean.draw`).
