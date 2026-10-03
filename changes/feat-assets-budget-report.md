### Added

- `assets budget` scans custom/imported or pulled GLBs offline and reports per-model bytes, stored triangles, and image dimensions with configurable CI limits and actionable failures.
- `readGlbMetrics` and Node `createAssetBudgetReport` / `checkAssetBudget` expose the same inspection; reindex records successful inventory in optional `IndexEntry.metrics`.
