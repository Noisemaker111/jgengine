# Recipe — controls (bindings → contexts → devices → feel)

**What this wires:** a game's controls from small parts: named actions, layered contexts that swap bindings live, keyboard/mouse and gamepad on the same actions, and per-axis feel. There are no control presets; every game names its own actions and codes.

## The seams

- **Actions.** `defineGame({ input: { action: codes } })` maps action names to codes. Keyboard codes are `KeyboardEvent.code` (`KeyW`), pad buttons are `pad:<index>` and stick or trigger directions are `padaxis:<index>+`/`-` in the standard mapping. `bindingLabel(code, "xbox")` gives the glyph text for prompts. Sim code reads actions only: `ctx.input.isDown`, `justPressed`, `value` (0..1, analog when a stick or trigger drives it) and `axis(bindings)`.
- **Contexts.** `actionContextStack(ctx)` (`@jgengine/core/game/controlGate`) layers action maps over the base input. `push({ id, codes, passthrough, axes?, shaping? })` swaps bindings immediately: the shell re-binds keyboard, touch and pad on the next frame, and a key held across the swap keeps counting toward whatever it maps to now. `passthrough: false` hides everything below (menus, a parked vehicle); `passthrough: true` adds or overrides a few actions (a build mode on top of on-foot). The stack has `snapshot`/`restore`, so the current mode survives a save.
- **Axes and feel per context.** A context can carry `axes` (axis bindings by action name) and `shaping` (serializable `createAxisShaper` profiles). Read them with `activeAxes()` when `version()` changes and `retune` the shaper, so on-foot movement and driving steer each get their own ramp and curve without a branch per mode.
- **Pad feel.** `defineGame({ gamepad: { deadzone, curve, triggerDeadzone } })` shapes sticks and triggers before values reach `ctx.input`; the axis shaper only adds ramps and speed scaling on top.
- **Timing.** `createInputBuffer` (`@jgengine/core/input/inputBuffer`) buffers early presses, coyote time, hold duration and double taps.
- **Local seats (couch co-op).** `defineGame({ localPlayers: { maxSlots: 4 } })` opens seats on one screen. The first pad to press a button shares the primary seat with keyboard and touch (`claimPrimary: "none"` keeps the primary keyboard-only); each further pad hot-joins its own seat, and the shell calls `loop.onNewPlayer(ctx, { userId, isNew: true })` for it, so spawn with `player?.userId ?? ctx.player.userId`. Read a seat with `localPlayers(ctx).local(slotId)` → `{ userId, input }` (`@jgengine/core/runtime/localPlayers`); iterate `slots()` in `onTick`. Seats use the same bindings and contexts as the primary, and the shell's walk controller moves every seat's entity. The table has `snapshot`/`restore`/`retune`.
- **Split-screen.** `defineGame({ viewports: { layout: "auto", split: "vertical" } })` draws one viewport per joined seat (`@jgengine/core/game/viewports`: `splitViewports`, `resolveViewports`, `viewportPixels`). The primary seat keeps the main camera rig; other seats get a chase or top-down follow camera (`viewports.camera`, defaulting to top-down when the main rig is), and the walk controller moves each seat relative to its own camera. `ViewportHuds` (`@jgengine/shell/camera/Viewports`) gives each seat its own HUD root. Post-processing is skipped while the screen is split. `bun run drive couch --param gamepad=2` shows two seats.
- **Rebinding.** `createRebindSession` drives a conflict-aware "press a key" flow; overrides persist per game and apply under the context stack.

## Wiring a mode swap

```ts
const DRIVING: ActionContext = {
  id: "driving",
  codes: { exit: ["KeyF", "pad:3"] },
  passthrough: true,
  axes: { steer: { positive: ["steerRight"], negative: ["steerLeft"] } },
  shaping: { steer: { digital: { riseRate: 3, returnRate: 6 }, analog: { deadzone: 0.08, curve: 1.5 } } },
};

// enter: actionContextStack(ctx).push(DRIVING); leave: actionContextStack(ctx).pop("driving")
if (state.contextVersion !== contexts.version()) {
  state.contextVersion = contexts.version();
  const layer = contexts.activeAxes();
  state.bindings = { steer: layer.bindings.steer ?? { positive: [] } };
  state.shaper.retune({ axes: { steer: layer.shaping.steer ?? {} } });
}
const raw = ctx.input.axis(state.bindings);
const axis = state.shaper.shape(dt, raw, { analog: analogAxes(state.bindings, ctx.input.analog()) });
```

`bun run drive handling` runs this: F pops the driving context and a held W stops reaching the engine.

## Pitfalls

- Actions that exist only inside a context are published to `ctx.input` while the context is active, but the base `input` map is what the touch dock and settings menu list. Keep an action in the base map when touch players need it.
- `shaping` has no `scale` callback because contexts are serializable; apply speed-sensitive scaling on the shaper the game owns.
