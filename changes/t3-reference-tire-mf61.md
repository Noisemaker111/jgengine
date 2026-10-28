a full Pacejka Magic Formula 6.1 tyre in physics/reference (combined slip, camber, inflation pressure, turn and spin slip with parking torque, Fx Fy Mx My Mz) with the published TNO 205/60 R15 coefficient set and a .tir reader

### Added

- a full Pacejka Magic Formula 6.1 tyre in physics/reference (combined slip, camber, inflation pressure, turn and spin slip with parking torque, Fx Fy Mx My Mz) with the published TNO 205/60 R15 coefficient set and a .tir reader
- createMagicFormulaTire, a transient tyre with relaxation-length contact dynamics that holds still at standstill and converges at second order as the step halves
- MF 6.1 vertical force from deflection, effective rolling radius, relaxation lengths and spin slip helpers
- `TNO_205_60R15` (`@jgengine/core/physics/reference/magicFormulaTire`): The TNO 205/60 R15 passenger-car tyre (`TNO_car205_60R15.tir`, MF-Tyre/MF-Swift 6.2 fit, Delft-Tyre 2013), the parameter set listed in Pacejka, *Tire and Vehicle Dynamics*, 3rd ed. Also `MagicFormulaCoefficients`, `MagicFormulaInput`, `MagicFormulaOutput`, `MagicFormulaTire`, `MagicFormulaTireOptions`, `MagicFormulaTireState`, `MagicFormulaTireStep`, `MagicFormulaTireStepInput` and 8 more.

### Changed

- Tests reproduce the coefficient set's published characteristic values within 1% (peak friction, cornering and slip stiffness, pressure terms, trail, rolling resistance, vertical stiffness); tyre temperature is left out because MF 6.1 has no thermal model and no thermal set is published for this tyre
- Part of #2698
