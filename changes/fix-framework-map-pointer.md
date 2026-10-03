### Fixed

- `FullscreenMap` owns a single pointer, discards canceled route drafts, and retires gestures on close, tool changes and unmount. Native mouse chords and outside release preserve ownership; map clicks place waypoints while custom overlay controls keep their input.
