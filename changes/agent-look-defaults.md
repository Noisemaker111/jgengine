### Added

- `mood` on `defineGame` (`Mood` from `@jgengine/core/render/lookMood`): one art-direction field for the light — `"day"`, `"bright"`, `"golden"`, `"dusk"`, `"overcast"` or `"night"`, or `{ preset, sun, skyColor, horizonColor, groundColor, fog, exposure, saturation, contrast, shadows }` to move a few tokens. It sets a cascaded shadow-casting key sun, a bounce opposite it, hemisphere fill, ambient, the dome's colours and sun (keeping the world sky's radius, clouds and day cycle), the haze range and the grade tint, all in agreement. `look` stays the rendering style; the two compose.
- `resolveMood` and `MOOD_PRESETS` (`@jgengine/core/render/lookMood`).
- `sky()` now passes `sunColor`, `fogColor`, `moonIntensity` and `moonColor` through.

### Changed

- `look: "cinematic"` tone-maps with ACES instead of AgX. Under a sunny sky AgX's flat curve read as a milky veil over the whole frame, and all seven shipped games had already overridden it to ACES. Other looks keep AgX.
- A styled `look` (anything but `"neutral"`/`"flat"`) with no `mood` and no authored ambient/hemisphere/directional light now gets the mood its sky implies (`"day"`, or `"dusk"`/`"night"` under those sky presets) instead of the sky's bare sun and hemisphere. Skies on a day cycle are left alone. Set `lighting` to keep a hand-built rig.
- The scene document's sky `sunIntensity`/`ambientIntensity` scale a mood's rig, and its sun angles place the mood's key light, so editor lighting controls keep working under a mood. Document lamps (light markers, environment point lights) join the mood's rig.

### Fixed

- Auto-exposure metered nothing: the WebGL2 pack buffer it reads back into was never sized, so every read failed, the meter saw black, and exposure sat pinned at its maximum (2.5x by default) in every game with a post chain. That is the washed-out, milky look. The buffer is now sized before the first read.
- `defineGame` now passes `look` through to the playable, so `look: "flat"` also turns off the shell's image-based light rig.
