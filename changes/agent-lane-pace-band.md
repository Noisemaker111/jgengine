### Added

- `PaceBand` on `DriverGoal` (`paceBand` + caller-measured `paceGap`) gives catch-up pacing an owner in `@jgengine/core/ai/driver`: a dead zone around `margin` (`tolerance`), `ease` shedding pace for a car ahead over `easeAt`, `push` adding it for a car behind over `pushAt`, and `scale` as the per-car share. `paceBandFactor(band, gap)` exposes the rule on its own. Deterministic scalar math, no allocation per step; the push never outdrives `DriverTuning.maxSpeed`. First adopter: Drift Foundry's rival field, which deletes its own `paceBand`; second: Harbor Heat's interceptors.
