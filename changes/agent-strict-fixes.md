browser proof flows can move the mouse, look and aim with real pointer input again (flow.moveMouse, flow.look, flow.aimAt), restoring the pointer-lock look and crosshair aim lost when the JSON drive steps were replaced

Root cause: the proof-flows change deleted the aim module and the step-assert tests without moving them to the flow runner

### Added

- browser proof flows can move the mouse, look and aim with real pointer input again (flow.moveMouse, flow.look, flow.aimAt), restoring the pointer-lock look and crosshair aim lost when the JSON drive steps were replaced
- `FLOW_AIM_TOLERANCE_PX` (`@jgengine/core/play/flow`): How close {@link BrowserFlow.aimAt} must bring the target to the crosshair, in CSS pixels.

### Fixed

- the 17 aim and look checks removed with the old drive steps are restored, and the 12 removed drive-step assertion checks now live as browser flow tests (failing expect stops the run, strict value matching, a page error, a timed-out wait)
