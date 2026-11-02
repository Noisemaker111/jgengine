LLMville runs on the engine: the shell game player, the UI kit, the editor scene, the rule parts and the shared-world contracts replace its private copies

Part of #2837

### Added

- LLMville mounts in the shell game player: shell first-person movement, camera, lighting and server join replace its private controller, profiler, clock and session glue
- LLMville's HUD, tablet frame, cards, toasts and settings run on the UI kit, with its warm cream, coral and teal palette as kit tokens (look direction A)
- LLMville's rules use the engine parts: grid hookup and research tiers are Ladders, rack heat a Meter, bills the Schedule, the daily market a Table with Modifiers, the tutorial onboarding and the neighbourhood goal a contribution pool; every price and rate is pinned by tests
- LLMville's shared world rides the shell presence lane and the engine chat contract, drawn through a new `scene.RemotePlayers` seam
- Core `useCalendarClock` (`time/calendarClock.view`), a live in-world date and time aligned to the server clock
- Core `pickKeyed` in `random/pick`, a Table pick by an integer key so every client agrees on a shared day
- Core `validatePlacementBounds` beside `validatePlacement`, for bounds a game has already measured
- Touch controls take `touch.reserve` edge bands, so a game's own bottom bar never covers the joystick
- Presence functions take a `checkpoint`, presence sync leaves on last unsubscribe and unload, `helpers.findServer` reads the shared world, and chat messages carry `fromLabel`
- `KitCount` takes a node value, and rebind actions take a context so keys shared across contexts are not conflicts

### Removed

- LLMville's private level builder, asset workbench, builder agent and dev-only map decor; the world's authored home is `src/editor.scene.json`
- LLMville's private movement controller, input, touch controls, frame profiler and diagnostics overlay, clock, world join and presence glue
- LLMville's private UI components, settings screens and most of its stylesheet

### Migrate

- LLMville saved keybinds move from the `llmville` key to the shell's `LLMville` key once, and `moveBackward` becomes `moveBack`
- LLMville's Convex function paths change for the production switch: `jgengine/runtime:*` becomes `runtime:*`, presence moves to `presence:list/sync/leave`, chat to `multiplayer/worldChat:messages/sendMessage`; no schema change
