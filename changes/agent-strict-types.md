core, shell and ws type-check with noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noPropertyAccessFromIndexSignature and noImplicitReturns. All 1460 errors are fixed with guards, real types and small helpers, not casts: a missing array slot, a missing record key or an optional field that may be undefined is now a compile error.

### Added

- bun run check type-escapes fails a file that gains an any, a non-null !, an as cast or a @ts-ignore; the per-file count lives in scripts/type-escape-baseline.json, bun run gen lowers it, and an unavoidable escape is excused by a // type-escape: <why> comment.
- `ActionCodeModes` (`@jgengine/core/input/actionBindings`): The hold/toggle form of an {@link ActionCodes} entry, with an optional auto-repeat rate.

### Changed

- core, shell and ws type-check with noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noPropertyAccessFromIndexSignature and noImplicitReturns. All 1460 errors are fixed with guards, real types and small helpers, not casts: a missing array slot, a missing record key or an optional field that may be undefined is now a compile error.

### Fixed

- spreading a game's place physics over the base no longer erases base gravity or jump velocity with an undefined.
- the four ActionCodes readers (camera, gamepad, touch, rebind) share one isCodeList / allActionCodes / primaryActionCodes instead of four copies with casts.

### Removed

- `@jgengine/core/boot/assetPrefetch` no longer exports `AssetPrefetch`, `PrefetchState`, `pagePrefetch`.
- `@jgengine/core/boot/BootDirector.draw` no longer exports `BootSignals`, `ENTER_QUIET_MS`.
- `@jgengine/core/boot/bootScreen.view` no longer exports `bootLoadingAreas`, `useBootStep`.
- `@jgengine/core/boot/bootSequence` no longer exports `BOOT_SEQUENCE_ATTRIBUTE`, `BOOT_STEPS`, `BootSequence`, `BootSequenceState`, `BootStep`, `pageBoot`.
- `@jgengine/core/boot/prefetchTier` no longer exports `PrefetchItem`, `PrefetchTier`, `orderPrefetch`.
- `@jgengine/core/devtools/frameBreakdown` no longer exports `DrawCost`, `FrameBreakdownRecord`, `FrameBreakdownSummary`, `HITCH_MS`, `Hitch`, `NamedCost`, `Spread`.
- `@jgengine/core/devtools/frameBreakdown.draw` no longer exports `BreakdownRenderer`, `BreakdownStore`, `FrameBreakdown`, `measureComposerPasses`.
- `@jgengine/core/devtools/types` no longer exports `LastFrameSample`.
