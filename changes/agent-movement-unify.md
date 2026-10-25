### Migrate

- `createRunLoop` (`@jgengine/core/run/runLoop`) is gone. Use `createSessionLoop` (`@jgengine/core/run/sessionLoop`): `run` → `session`, `completed` → `closed`, `haul` → `carried`, `changeId` → `optionId`, and `settle(input)` takes the game's own input and returns its `result`.
- `createAircraftDynamics` and `AircraftTuning` (`physics/flightDynamics`) are gone. Use `createRigidAircraft` (`@jgengine/core/physics/aircraftDynamics`, also on `@jgengine/core/world`); the flight-feel recipe maps the fields.
- Camera shake is one controller. `createCameraShakeChannel`, `defaultCameraShakeChannel`, `ControllerCameraShake`, `traumaShake`/`addTrauma`/`stepTrauma`/`shakeOffset` and `shakeChannelMath` are gone. `cameraShake(amplitude, decay?)` (`@jgengine/shell/camera`) feeds `defaultCameraShake`, the core `createCameraShake` controller every rig applies; `camera.shake` tunes it.
- `useCameraShake(controller, animate)` (`@jgengine/react`) is `useCameraShakeReadout(controller)`; it only reads. `CameraShakeMeter` drops `animate`.
- `DEFAULT_WALK_CODES` moved to `@jgengine/core/input/actionBindings` (still on `@jgengine/shell/gameKit`).

### Added

- `DEFAULT_DRIVE_CODES` (WASD/arrows throttle, brake, steer, Space handbrake) and public `hotbarSlotBindings(count, { action })` in `@jgengine/core/input/actionBindings`.
- `useActionBindings()` and `ActionBindingsProvider` (`@jgengine/react/uiKitRoot`): the game's live key bindings, rebinds included. The shell provides them to every game, so `useActionGlyph` and kit prompts work without a UI kit and follow a rebind.

### Fixed

- Camera shake now reaches the screen on every rig: `cameraShake()` used to feed a channel the rigs never read, and the orbit, first-person and inspection rigs applied no shake at all.
- Right-click never opens the browser menu over a game (text fields keep it). Right-drag orbits the orbit rig, and a right-drag no longer also fires the game's right-click action.
