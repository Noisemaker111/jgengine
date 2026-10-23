### Added

- `createAgentSystem` (`@jgengine/core/agents/system`) takes a game's needs, options, mood weights, members and
  schedules once and returns a running cast: one `tick(dt)` for everyone, one target selector for the whole system,
  a fallback declared once, and a plain-JSON `save()`/`load()` that rides the game's own save.
