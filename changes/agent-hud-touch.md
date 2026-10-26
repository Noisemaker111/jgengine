Touch controls are obstacles the HUD layout knows about: on a phone with touch on, no HUD panel lands on the joystick, the action cluster, a pinned touch button or a game's own touch pads.

### Migrate

- `--jg-hud-dock-clearance`, `--jg-hud-dock-clearance-left|center|right`, `touchDockInsets`, `touchDockClearance`, `TouchDockInsets` and `floatingJoystickZoneHeight` are gone. A game with its own touch controls registers each one with `useRegisterLayoutRegion({ id, kind: "control", collisionPolicy: "forbid" }, ref)` (`@jgengine/core/ui/viewport.view`) instead of setting the CSS variables.

### Fixed

- `HudCanvas` keeps panels clear of the measured rectangle of every region registered as kind `control` or `system`, instead of a guessed height over each bottom third of the screen. Harbor Heat's minimap, Scrap Signal's loot and vitals, Apex Nights' garage and Hold the Line's bottom bar no longer sit under touch buttons.
- Touch buttons a game pins to an anchor (`touch.buttons` with `anchor`) register as control regions, so the HUD and the collision check see them.
- `arrangeHudPanels` shrinks the HUD before lifting a panel off its edge into the play view: a bottom bar squeezed between the joystick and the action cluster (Fernwild's build bar) stays on the bottom edge at a smaller zoom, and lifts only when no zoom down to `minScale` keeps it there.
- Drift Foundry registers its steering and pedal pads as control regions; Apex Nights' garage panel grows to fit its price tags instead of spilling onto the action buttons.

### Bends

- Deleted the three `touchDockInsets` unit tests along with the function they tested; the new "touch controls are obstacles" browser test and the solver tests cover the behaviour that replaced it.
