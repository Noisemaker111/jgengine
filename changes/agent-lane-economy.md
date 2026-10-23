### Added

- `createStanding` (`@jgengine/core/progression/standing`) holds per-faction or per-district standing over authored tracks and moves it from named outcomes, so an outcome that resolves to nothing throws at the call instead of silently moving nothing.
- `createGateSet` (`@jgengine/core/progression/gates`) evaluates authored milestones against standing and money, and refuses to load when a gate's unlock id resolves to nothing.
- `createCareerBank` (`@jgengine/core/progression/careerBank`) keeps persistent career money apart from a run's haul, so a failed run loses the haul and keeps the bank.
- `createUpgradeTree` (`@jgengine/core/progression/upgrades`) prices each rank from the shared curve primitive and gates purchases on prerequisites and standing.
