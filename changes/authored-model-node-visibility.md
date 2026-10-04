### Added

- Scene markers can store `meta.hiddenNodes` as exact node names, shared by runtime props and editor material previews. Omission preserves model defaults; an empty list clears the selection. Nonempty selections keep automatic props on individual renderers, and generic scatter rejects unsupported node hiding before cloning.
