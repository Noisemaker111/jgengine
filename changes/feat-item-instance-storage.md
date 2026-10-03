### Added

- Generated item registries accept caller-owned synchronous storage and a saved allocation sequence; `statePages` and `restorePages` stream detached save batches through atomic replacement while preserving the existing whole-state format.

### Fixed

- Generated item allocation checks attached storage for id collisions and rejects unsafe allocator sequences or exhausted numeric ids.
