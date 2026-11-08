Shadow cache: static casters draw once into a per-light depth layer and each pass redraws only the casters that changed, bit-identical to a full redraw (0 differing texels on all 9 frame games, walking and standing). Closes #3018

### Added

- `ShadowPassPlan` (`@jgengine/core/lighting/shadowCache`): Same-image shadow caching, the renderer-agnostic half: what one light's depth pass draws this frame.

### Changed

- Shadow cache: static casters draw once into a per-light depth layer and each pass redraws only the casters that changed, bit-identical to a full redraw (0 differing texels on all 9 frame games, walking and standing). Closes #3018
