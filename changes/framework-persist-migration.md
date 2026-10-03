### Added

- Declarative `PersistConfig.migrate` forwards the existing runtime-save migration hook, allowing games to convert or reject incompatible old world snapshots before restoration. Matching versions bypass it; omitting migration preserves compatible mismatch loading.
