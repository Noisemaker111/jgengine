### Migrate

- The sky lives in one folder per layer. Update deep imports:
  - `@jgengine/core/render/{physicalSky,skyOwnedLighting}`, `@jgengine/core/world/volumetricClouds` and `@jgengine/core/time/dayNightCycle` → `@jgengine/core/sky/…`.
  - `@jgengine/shell/environment/daylightCycle` → `@jgengine/core/sky/daylightCycle` (pure model, no three.js).
  - `@jgengine/shell/environment/{Daylight,VolumetricClouds,skyBands,skyLightingPolicy,sunShadowMath}` → `@jgengine/shell/sky/…`. The `@jgengine/shell/environment` barrel still exports `Sky`, `SkyDome` and `VolumetricClouds`.
- `lerpHexColor` is gone; the day/night models mix colours with `mixHex` from `@jgengine/core/render/color`, which now also reads bare `rrggbb`.
