### Added

- `EditorSession.transaction(commands)` stages heterogeneous authoring commands atomically with indexed validation errors and one undo/redo step.

### Fixed

- Editor command patches no longer leave partial edits or multiple live publications when a later command fails. Stable-id upserts and already-current edits succeed without duplicate placements or new revisions.
