### Added

- `requestSceneCapture` and `requestSceneThumbnail` (`@jgengine/shell/render/sceneCapture`) ask the live scene for a frame or a save-card thumbnail. A request waits for `SceneCaptureBinding` to mount, waits for the canvas to paint, retries a blank read and resolves with the image or a stated failure (`no-binding`, `no-frame`, `undecodable`), so a game stops polling for the binding and waiting frames before a save screenshot.
- `registerSceneCapture` (`@jgengine/shell/render/sceneCapture`) lets a host that owns its own canvas hand the capture path a reader.

### Changed

- `GameMenu`'s `style` and `detailStyle` accept `--jg-*` custom properties (`GameMenuStyle`), so a game passes `{ "--jg-menu-surface-radius": "12px" }` without a cast.
- `GameMenu` sets `pointer-events: auto` on its own root while its painted backdrop stays `none`, so a menu inside a HUD wrapper that passes clicks through to the scene no longer has dead buttons.
