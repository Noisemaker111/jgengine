### Changed

- Nine games (apex-nights, beacon-bastion, briarcrown, hold-the-line, orbit-watch, outpost-zero, red-frontier, saltwick, the-sunken-crown) now pass the strictest type settings, ahead of those settings turning on for every game.
- Games read a placed object's authored settings through `metaNumber`, `metaText` and `requireMetaText` (`@jgengine/core/editor/markerMeta`), which fail loudly on a wrong value instead of casting it.
- `CompassProps.center`, the kit vitals objective's `id`/`goal`, and kit buttons' `cue` accept an explicit `undefined`.

### Fixed

- A new game made with `--no-editor` now gets the starter sun angle; it was written in the editor's shape, which `sky()` ignored.
