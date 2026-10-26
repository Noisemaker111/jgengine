### Migrate

- `@jgengine/shell/world/WorldHud` → `@jgengine/shell/hud/WorldHud` (same exports).
- `@jgengine/shell/vision/FrustumSensorHud` → `@jgengine/shell/hud/FrustumSensorHud` (same exports).
- `@jgengine/shell/vision/HiddenStateProbeHud` → `@jgengine/shell/hud/HiddenStateProbeHud` (same exports).

### Changed

- The API orphan ratchet treats a symbol whose file moved folders as the same entry (package + name), so moving a module no longer needs `@internal` to pass.
