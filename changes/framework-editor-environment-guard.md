### Migrate

- `setEnvironment` now rejects invalid environment data before changing editor state, history, or live revisions. Use supported `day`, `dusk`, or `night` presets and valid authored fields; rejection reports the existing document path diagnostic.

### Fixed

- Editor environment commands store decoded copies of nested fields, preventing later input mutations from changing authored state.
- The monorepo editor CLI validates the full scene before saving and preserves existing file bytes when validation fails.
