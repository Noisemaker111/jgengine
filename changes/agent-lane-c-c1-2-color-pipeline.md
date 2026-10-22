### Added

- `environment.grading` on the scene document authors a per-game colour grade: shadow/midtone/highlight swatches plus tint, saturation and contrast bake into a small display-space LUT (`lutCubeFromGrading`, `colorGradeFromDocument` in `@jgengine/core/editor/environment`), edited in the Lighting workspace. The shell applies it from `editorLayers`, and a graded game needs no LUT asset or hardcoded pass.
- Clamped auto-exposure: `postProcessing.autoExposure: { min, max, adaptationSeconds } | false` meters the pre-tone-map frame every four frames toward 18% grey and stays inside the authored range. `WHITE_POINT` and `MID_GREY` in `@jgengine/core/render/colorPipeline` are the single documented calibration the pipeline uses.
- `GradeConfig.lut` also accepts a baked `{ cube: { size, data } }` LUT, sampled trilinearly after the numeric grade.

### Changed

- AgX is the pipeline's tone map: `postProcessing.toneMapping` defaults to `"agx"`, and the `cinematic`, `photoreal`, `comic`, `retro` and `STUDIO_STAGE_POST` configs now pick it too. `"toon"` keeps `"linear"` on purpose. Games that authored `"aces"` explicitly are unchanged.
- The grade pass samples LUT tiles at texel centres and blends the blue axis by hand, so a supplied strip LUT no longer bleeds across slices.
