### Added

- `postProcessing.atmosphere` (`AtmosphereConfig`, `DEFAULT_ATMOSPHERE`): exponential height haze that fades distant ground into the sky and brightens toward the sun, plus screen-space light shafts where the sky shows through gaps. On by default on medium and up, tuned per `mood` (overcast hazes without shafts, golden and dusk have the most of both); skipped when the scene has no shadow-casting sun.
- World reflection probe: on medium and up the shell captures the scene around the camera into a cube map one face per frame (64/128/256 px by tier, every 8/4/2 s or after the camera travels), and metal, glossy and glass materials without their own environment map reflect it. An authored HDRI or cube map still wins.
- The sky dome adds a forward-scattering glow around the sun and reddens the horizon on the sun's side when the sun is low, following the day cycle.
