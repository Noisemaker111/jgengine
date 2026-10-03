### Added

- Serializable physical material assets, texture metadata and exact named mesh/slot assignments preserve imported materials and maps unless explicitly overridden.
- Shared physical surface rendering, fuzzy sheen, directional woven appearance, hair-card ribbons and coverage/backscatter approximations; geometry and simulation remain separate.
- Materials workspace edits six family-specific groups and advanced maps, previews neutral or document lighting, and shares editor undo, save and typed RPC with runtime.
- Native glTF material inventory and export diagnostics preserve packed channels, extensions and attribution; resource accounting and appearance adapters consume wetness/exposure without changing global lighting.

### Fixed

- Model material promotions and shared texture views have explicit ownership and cleanup; unused material-library maps are not loaded.
