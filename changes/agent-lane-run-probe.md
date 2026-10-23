### Added

- `RunLoop.present(count)` and `RunLoop.choose(id)` (`@jgengine/core/run/runLoop`) draw several next-run changes for a choice screen and adopt the pick, so a game that offers three relics does not compose `game/runDraft` beside the loop. `present` honours the same `after` gates and weights as the single draw and never repeats the change just played while alternatives remain; `choose` opens the next run around the pick and refuses an id the loop's table does not carry.
- `installRunProbe` (`@jgengine/core/run/runLoop`) publishes `window.__jgengineRun` with the run in progress, what it carries, what it banked or lost, its best bank and the change it offers, so a capture or devtools read proves the loop is live instead of only imported.
