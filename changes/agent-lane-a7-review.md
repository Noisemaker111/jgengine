### Added

- `releasePostfxOverlayTracking(scene)` (`@jgengine/shell/postfx/postfxOverlay`) drops the cached prepass overlay set and its listeners for a scene that is being torn down.

### Fixed

- Postfx prepasses no longer walk the whole scene twice a frame to hide overlays, points and lines: the set is cached per scene and rescanned when the scene graph changes. Drift Foundry 2.11 ms/frame and Harbor Heat 0.66 ms/frame of `traverse` removed.
- A rig posed from an animation graph no longer allocates a motion sample, a position triple and a fresh pose record every frame, and foot IK no longer allocates a probe input, filter, closure and per-leg records every frame.
