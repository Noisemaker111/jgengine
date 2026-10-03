### Fixed

- Node file persistence now rejects chunk-directory read errors other than `ENOENT`, preventing host admission with an empty world when an existing checkpoint cannot be read. A missing directory still means no saved chunks; the same host can retry after backend repair.
