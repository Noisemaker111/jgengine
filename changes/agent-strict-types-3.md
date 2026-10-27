Scripts, the UI registry, the dev, web and desktop apps and the host examples now type-check with the same strict flags as the engine packages (noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noPropertyAccessFromIndexSignature, noImplicitReturns). About 1000 errors fixed with guards and real types, no new casts.

### Changed

- Optional fields on registry slot props (`ActionBarSlot`, `ItemGridSlot`, `BuffChip`), `EditorAppProps`, the ws host's `listOpenServers` args and a few core option types accept an explicit `undefined`.

### Fixed

- Script readers of changelog headings, PNG headers and screenshot pixels no longer read past the end of their input.
