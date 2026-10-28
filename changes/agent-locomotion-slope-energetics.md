The reference walker's muscle cost now comes from the work its fibres do (Margaria 1968), so walking up and down a 6% grade costs what Minetti measured over level ground.

Part of #2779

Root cause: the old muscle cost (Minetti & Alexander 1997) charged lengthening muscle at the full isometric rate, so braking downhill cost almost as much as climbing; uphill came out 1.19× level and downhill 0.80× (measured 1.54× and 0.61×).

### Fixed

- Net walking cost on a +6% grade is 1.44× level and on a −6% grade 0.65× (Minetti et al. 2002: 1.44–1.64× and 0.51–0.71×); level walking at 1.3 m/s still costs 3.14 J/(kg·m), inside Ralston's ±12%

### Changed

- `muscleMetabolicPower(state)` charges positive fibre work at 1/0.25 and negative at 1/1.2 (Margaria 1968), the model that best follows slope changes of seven compared by Koelewijn et al. 2019; `MuscleState` carries `activeForce`
- `FITTED_WALKS` are refitted under the new cost, with slope fits at 1.3 m/s

### Migrate

- `muscleMetabolicPower(spec, state)` is now `muscleMetabolicPower(state)`
