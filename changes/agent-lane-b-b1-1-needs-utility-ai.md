### Added

- `createNeedSet` (`@jgengine/core/gameplay`) drains named needs on game time and reads them by index — decaying hunger, energy, fun with snapshot/restore and per-need rate retuning.
- `createUtilityBrain` (`@jgengine/core/world`) picks an action from decaying-need appeal: linear, quadratic, logistic, exponential and threshold response curves, candidate cost (travel, queues, price), a switch margin plus minimum hold (hysteresis), declared interrupts, optional seeded jitter, and a devtools probe string.
