### Added

- `LightingConfig.iblAmbientScale` (default 0.5) and `LightingConfig.fallbackKey` (default true); `balanceLightingForIbl` in `@jgengine/core/render/lightingBalance` applies them.
- `DirectionalLightingConfig.shadowRadius` (PCF penumbra in texels, default 1.25).
- `DEFAULT_AO` in `@jgengine/core/render/postProcessing` and `mergePostProcessing` in `@jgengine/core/render/lookPreset`.

### Changed

- The procedural IBL probe has a zenith/horizon/ground gradient and an HDR sun disc plus a broad lobe, with the horizon leaning toward the ambient colour, at intensity 0.45 (was a 2-colour gradient at 0.35), so forms get a lit and a shaded side from IBL alone.
- Under IBL (every look but `"flat"`), authored ambient is halved, and lighting with no directional light gets a soft shadowless key light (intensity 0.6, tinted by the ambient colour).
- A post chain that omits `ao` now runs `DEFAULT_AO` on medium tier and above; `ao: false` still opts out. `NEUTRAL_POST_PROCESSING` no longer sets `ao: false`.
- Styled look presets deep-merge their post stages under a partial game `postProcessing` instead of being dropped whole.
- Shadows use `PCFShadowMap` instead of `PCFSoftShadowMap`, which three r182 compiles as unfiltered basic shadows (stair-stepped edges), with a default radius of 1.25 texels on configured and cascaded lights.
- GTAO samples are tiered: 8 on medium, 12 on high (was 16), 16 on ultra.
