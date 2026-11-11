the CSS-to-Rune mirror (RuneLayer, ?ui=rune, cssMirror, cssStates, domMeasure, runeInput, patches, boxTransform, videoFrames, cssValues) and the uiTour flow built on it. Every game draws its UI on native Rune surfaces; loadGameFonts now registers fonts with the native surface.

Engine seam: packages/core/src/play/uiTour.ts, packages/core/src/ui/fonts.view.ts, packages/core/src/ui/rune/boxTransform.ts, packages/core/src/ui/rune/cssMirror.view.ts, packages/core/src/ui/rune/cssStates.view.ts, packages/core/src/ui/rune/cssValues.ts, packages/core/src/ui/rune/domMeasure.view.ts, packages/core/src/ui/rune/patches.ts and 7 more

### Removed

- the CSS-to-Rune mirror (RuneLayer, ?ui=rune, cssMirror, cssStates, domMeasure, runeInput, patches, boxTransform, videoFrames, cssValues) and the uiTour flow built on it. Every game draws its UI on native Rune surfaces; loadGameFonts now registers fonts with the native surface.
- `@jgengine/core/play/uiTour` no longer exports `TourStep`, `uiTour`.
- `@jgengine/core/ui/rune/cssMirror.view` no longer exports `MirrorReport`, `WireBox`, `boxOfElement`, `elementOf`, `idOf`, `mirrorContents`, `mirrorElement`, `mirrorRoot` and 5 more.
- `@jgengine/core/ui/rune/cssStates.view` no longer exports `stateMatters`, `twinStateRules`.
- `@jgengine/core/ui/rune/cssValues` no longer exports `WireDim`, `WireImageLayer`, `WireLayer`, `WireShadow`, `WireTextShadow`, `WireTrack`, `WireTransform`, `averageOfStops` and 18 more.
- `@jgengine/core/ui/rune/domMeasure.view` no longer exports `RuneScrollDriver`, `installRuneMeasure`, `invalidateRuneLayout`, `runeRectOf`, `setRuneRect`, `setRuneScroll`.
- `@jgengine/core/ui/rune/patches` no longer exports `compactPatches`.
- `@jgengine/core/ui/rune/runeInput.view` no longer exports `RuneInput`.
- `@jgengine/core/ui/rune/runeLayer.view` no longer exports `RuneLayer`, `runeUiEnabled`.
- `@jgengine/core/ui/rune/runeStage.view` no longer exports `RuneStage`, `registerRuneFont`.
- `@jgengine/core/ui/rune/videoFrames.view` no longer exports `VideoFrameSource`.
