the editor's Step button moves the game by exactly one simulation step; a render frame shorter than one fixed step used to spend the step and leave time where it was

Root cause: the play bridge unpaused the clock for one render frame, but the sim runs fixed 60 Hz steps, so a short frame ran none. The clock now owes paused steps to simulation steps (ctx.time.step(n)).

Closes #2885

### Fixed

- the editor's Step button moves the game by exactly one simulation step; a render frame shorter than one fixed step used to spend the step and leave time where it was

### Removed

- consumeRuntimePlayStep, which encoded the same per-frame model and had no users.
- `@jgengine/core/editor` no longer exports `consumeRuntimePlayStep`.
- `@jgengine/core/editor/runtimeInspector` no longer exports `consumeRuntimePlayStep`.
