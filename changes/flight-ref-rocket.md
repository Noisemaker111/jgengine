a reference rocket in flight/reference (createRocket): multistage 6-DOF on a rotating WGS 84 Earth with J2 gravity, the 1976 standard atmosphere, thrust curves that lose ambient pressure on each nozzle, gimballed engines, staging, jet damping and drag through Mach, with steerRocket and gravityTurnTarget to fly it

### Added

- a reference rocket in flight/reference (createRocket): multistage 6-DOF on a rotating WGS 84 Earth with J2 gravity, the 1976 standard atmosphere, thrust curves that lose ambient pressure on each nozzle, gimballed engines, staging, jet damping and drag through Mach, with steerRocket and gravityTurnTarget to fly it
- the Saturn V AS-506 S-IC flight (SATURN_V_AS506), validated against the Apollo 11 flight evaluation report within 1% at both engine cutoffs, plus exact Tsiolkovsky staging, a closed circular orbit and J2 node regression within 1%
- compareRocketAscent in bun run perf flight flies a game motor build of the same rocket beside the reference and the report
- `WGS84_EARTH` (`@jgengine/core/flight/reference/rocket`): WGS 84 Earth (NIMA TR8350.2): μ, equatorial radius, flattening, J2 and rotation rate. Also `EarthModel`, `GravityTurnProgram`, `Rocket`, `RocketAero`, `RocketControl`, `RocketDesign`, `RocketEngine`, `RocketLaunch` and 11 more.
- `compareRocketAscent` (`@jgengine/core/flight/reference/rocketComparison`): Flies the Saturn V AS-506 S-IC ascent three ways and lines them up: the game's rigid-body `motor` model built from the published numbers ({@link saturnVGameTuning}), the reference rocket ({@link createRocket}), and the flight evaluation report. Also `saturnVGameTuning`.
- `F1_ENGINE` (`@jgengine/core/flight/reference/saturnV`): Rocketdyne F-1 as flown on AS-506, read from the flight evaluation report's S-IC stage performance (MPR-SAT-FE-69-9, figure 5-3): 34.0 MN stage thrust at liftoff and about 39.8 MN near vacuum give 6.80 MN per engine at sea level and 7.955 MN in vacuum, so an 11.4 m² exit area; the 2655 kg/s propellant flow per engine that empties the stage at 161.6 s gives a vacuum specific impulse of 305.5 s. Also `SATURN_V_AS506`, `SATURN_V_AS506_ASCENT`, `SATURN_V_AS506_EVENTS`, `SATURN_V_AS506_LAUNCH`.

### Changed

- Part of #2698
