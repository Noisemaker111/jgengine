a component-level jet engine cycle in flight/reference: real-gas turbojet and turbofan, cooled turbines, afterburner and two-spool dynamics, validated on the F100-PW-220 and V2500-A1

### Added

- a component-level jet engine cycle in flight/reference (createGasTurbineCycle): real-gas turbojet and turbofan, mixed or separate exhaust, cooled turbines, afterburner and inlet recovery, solved off-design for thrust and fuel flow at any Mach and altitude
- createGasTurbineEngine gives the cycle two spools with inertia and a fuel control, so thrust lags the throttle the way a real engine does
- F100-PW-220 and IAE V2500-A1 engine designs, validated against published ratings, the NASA TP-1538 thrust tables and the Stevens & Lewis power lag
- createF16Model({ engine: "cycle" }) flies the reference F-16 on the F100 cycle instead of its thrust table
- bun run perf flight now measures every game jet's thrust lapse, afterburner and spool time against the F100 cycle (compareJetEngines)
- `WALSH_FLETCHER_GAS` (`@jgengine/core/flight/reference/gasTurbine`): Dry air and kerosene combustion products with temperature-dependent specific heat, from the polynomials of Walsh & Fletcher, *Gas Turbine Performance* (2nd ed., 2004). Also `GasModel`, `GasStream`, `GasTurbineComponents`, `GasTurbineCycle`, `GasTurbineDesign`, `GasTurbineFlight`, `GasTurbinePoint`, `InletKind` and 3 more.
- `createGasTurbineEngine` (`@jgengine/core/flight/reference/gasTurbineEngine`): Creates a {@link GasTurbineEngine}: two spools with real inertia flying the cycle's steady operating line, in the quasi-steady manner of simplified engine transient models. Also `GasTurbineCommand`, `GasTurbineEngine`, `GasTurbineEngineOptions`, `GasTurbineEngineOutput`, `gasTurbinePropulsion`.
- `compareJetEngines` (`@jgengine/core/flight/reference/jetEngineComparison`): Measures each game jet's engine against the F100-PW-220 cycle engine and real F100 figures: dry thrust, how it lapses with altitude and Mach, the afterburner ratio and spool-up time. Also `JetComparison`, `JetComparisonAircraft`, `JetComparisonRow`.
- `F100_PW_220` (`@jgengine/core/flight/reference/referenceEngines`): Pratt & Whitney F100-PW-220 (F-16C/D), sized at sea-level static from its published figures: 228 lb/s airflow, bypass ratio 0.63, overall pressure ratio 25. Also `F100_PW_220_DYNAMICS`, `F100_PW_220_PUBLISHED`, `MATTINGLY_LEVEL_3`, `MATTINGLY_LEVEL_4`, `V2500_A1`, `V2500_A1_PUBLISHED`.
- `f16CycleEngine` (`@jgengine/core/flight/reference/f16Aircraft`): the shared F100-PW-220 cycle engine the F-16 flies with `engine: "cycle"`.
- `ComparisonTable` (`@jgengine/core/flight/reference/flightComparison`): any game / reference / real table `formatFlightComparison` prints.

### Changed

- Part of #2698
