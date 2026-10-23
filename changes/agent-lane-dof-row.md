### Fixed

- The Graphics tab lists a post-processing stage toggle only when the game's resolved chain can build that stage. Depth of field, which no reference game authors, hid behind a row that switched a pass the composer never created, so the toggle changed nothing. The rule covers every stage: a chain with `ao: false`, `bloom: false` or `aa: "msaa"`/`false` no longer offers those rows, and a game with no post chain gets none of them. Every other settings row is unchanged (`@jgengine/shell/settings/settingsController`, `availablePostfxStages` in `@jgengine/shell/postfx/PostProcessing`).
