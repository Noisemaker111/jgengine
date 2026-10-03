### Fixed

- Composed systems retain each world's schedules and listeners when a definition hosts multiple contexts. Disposal drains all system and classic cleanup once despite errors or reentrancy, then rethrows the first error. Failed installation retires entered systems and acquired listeners while preserving the startup error; schedule/listener reinitialization starts a fresh lifecycle.
