grass streaming bounds its work per frame and resumes it on the next, growing the nearest leaf first so the first frame still shows grass

Root cause: grass selection ran unbounded before its timer started, walking kept every patch on its fill budget, and each of Fernwild's eight patches had its own budget; c99b564be made one 15 s model wait fail captures, so Fernwild's worker-grown trees failed every capture

### Added

- `GrassFrameShare` (`@jgengine/core/grass/grassFrameShare`): One frame's grass work shared by every patch drawn by one renderer.

### Changed

- AGENTS.md and jgengine-verify: a failed capture is a bug to fix, not a reason to stop after two tries

### Fixed

- grass streaming bounds its work per frame and resumes it on the next, growing the nearest leaf first so the first frame still shows grass
- grass rebuilds when the terrain under it changes
- every grass patch on a canvas shares one 3 ms frame budget, the 8 ms fill budget ends once the first view has filled, and the first fill counts as loading so play never starts on half-grown grass
- captures wait out slow model loads for the whole settle budget and, when they give up, name what is still loading
