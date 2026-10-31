LLMville PLAN.md names the engine owner of every module, the engine gaps, and six adoption milestones that each delete the private code they replace

Engine seam: none - game content only

### Migrate

- LLMville settings use the engine settings store (graphics.quality, accessibility.reducedMotion) and engine binding overrides for keybinds
- LLMville camera look and tablet menu state live in one engine key-value store document on injected storage; src/storage/storage.ts is deleted
- an existing llmville:app-settings blob and the old ai-game:* local keys move over once on first boot, with regression tests

### Added

- LLMville PLAN.md names the engine owner of every module, the engine gaps, and six adoption milestones that each delete the private code they replace
- LLMville art direction describes today's look and offers three directions for the owner to choose

### Changed

- Part of #2837
