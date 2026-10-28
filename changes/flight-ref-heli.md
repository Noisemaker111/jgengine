a reference helicopter in flight/reference (createHelicopterModel): blade-element main and tail rotors with Pitt–Peters dynamic inflow, flapping, cyclic, ground effect and vortex ring state, a governor and a power-limited engine, so autorotation emerges after an engine cut

### Added

- a reference helicopter in flight/reference (createHelicopterModel): blade-element main and tail rotors with Pitt–Peters dynamic inflow, flapping, cyclic, ground effect and vortex ring state, a governor and a power-limited engine, so autorotation emerges after an engine cut
- the MBB Bo-105 (createBo105Model), validated against NASA TM-110356 hover and forward-flight power within 12% and 7%, with trimHelicopter and trimIsolatedRotor
- compareRotorcraft in bun run perf flight measures each game rotor block against the Bo-105 rotor
- `createHelicopterModel` (`@jgengine/core/flight/reference/helicopter`): a blade-element helicopter on the reference 6-DOF. Also `HelicopterDesign`, `HelicopterModel`, `HelicopterModelOptions`, `HelicopterRotorTelemetry`, `HelicopterSurface`, `HelicopterTrim`, `HelicopterTrimCondition`, `trimHelicopter`.
- `evaluateRotor` (`@jgengine/core/flight/reference/helicopterRotor`): blade-element rotor loads, flapping and dynamic inflow. Also `RotorDesign`, `RotorFlow`, `RotorLoads`, `RotorPitch`, `IsolatedRotorCondition`, `IsolatedRotorTrim`, `createRotorLoads`, `naca23012RotorSection`, `rotorStateCount`, `rotorStateNames`, `settleRotor`, `solveNewton`, `trimIsolatedRotor`.
- `createBo105Model` (`@jgengine/core/flight/reference/bo105Helicopter`). Also `BO105_DESIGN`, `BO105_MAIN_ROTOR`, `BO105_TAIL_ROTOR`, `BO105_HOVER_DATA`, `BO105_FORWARD_FLIGHT_DATA`, `BO105_TUNNEL_AIR`.
- `compareRotorcraft` (`@jgengine/core/flight/reference/rotorcraftComparison`). Also `RotorcraftComparison`, `RotorcraftComparisonAircraft`, `RotorcraftComparisonRow`.
- `solveLinearSystem` and `steadyAirData` (`@jgengine/core/flight/reference/aircraftTrim`) are now exported.

### Changed

- `ReferencePropulsion.settle` and `evaluate` receive the surface deflections, so a rotor can read its controls.
- Part of #2698
