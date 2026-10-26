Drift Foundry play shots show the race instead of the result card of a run nobody drove.

### Fixed

- Drift Foundry's `play` and `mid-run` capture staging now hands the wheel to the course autopilot. The capture keeps the sim running while models stream, and the compactor caught the parked kart within seconds, so `shoot drift-foundry --mode play` filmed "caught you" every time.
