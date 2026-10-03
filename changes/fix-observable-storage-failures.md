### Added

- Key-value cells and local save backends accept optional storage failure observers and `errorMode: "throw"`, exposing original read/write/remove errors while retaining their legacy fallback defaults.

### Fixed

- Strict key-value failures preserve the prior cell and rejected payload writes preserve the stored checkpoint. Save slot metadata failures now report the existing error status and callback, including asynchronous updates after load, instead of reporting saved. Whole-world load/hasSave/slot switches no longer treat a denied read as a successful cached load.

### Migrate

- Default offline `ctx.game.save` now reports error when local storage is unavailable, denied, or full. Check `status()` before displaying saved; `await save()` alone does not imply success. Explicitly injected backends keep their policy. Choose `persist: { storage: "memory" }` or `memorySaveBackend()` for intentional ephemeral/headless saves.
- Slot index publication remains a separate operation: a payload may succeed before metadata fails, without cross-key rollback. Use the gameplay device-save-status recipe for checkpoint adoption and truthful UI.
