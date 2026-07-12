# JGengine UI — game presentation reference

This reference defines the required visual and interaction quality for JGengine games. The main `jgengine` skill owns engine architecture, hooks, input commands, and routing. This document owns what the interface looks like, how it is composed, how it responds, and how it is verified.

## The rule

A game must visually own its viewport. It must not resemble a dashboard, landing page, documentation page, or ordinary responsive web app.

HTML and React are valid implementation tools. Website visual grammar is not the default.

## 1. Start with a concise UI art direction

Before implementing screens, write this short block:

```md
UI ART DIRECTION

Player fantasy:
Emotional tone:
Shape language:
Material language:
Typography roles: display / body / numerical / labels
Motion language:
Icon language:
Sound language:
Information hierarchy:
Forbidden patterns:
```

Keep it practical. It should directly influence layout, silhouettes, controls, timing, and materials.

Example forbidden patterns:

- generic rounded dashboard cards
- pill buttons
- long centered paragraphs during play
- ordinary two-column form layouts
- persistent keyboard-instruction grids
- multiple equally weighted bordered panels
- generic translucent mobile circles
- large website-style modals
- document-flow wrapping used as HUD layout

A theme is not complete when only colors and fonts change. It must also affect composition, geometry, spacing rhythm, borders, icons, animation, sound, information density, terminology, button construction, and touch controls.

## 2. Screen inventory and hierarchy

Identify the screens the game actually needs:

- boot/loading
- title or attract screen
- mode selection
- onboarding/tutorial
- gameplay HUD
- pause
- settings
- map/inventory/dialogue where relevant
- victory/results
- failure/retry

For each screen, define:

- the player’s primary question
- the primary action
- the most important information
- what can be hidden
- what belongs in-world instead of in the HUD

### HUD tiers

**Tier 1 — immediate action and survival**
Health, timer, current target, ammo, danger, capture state.

**Tier 2 — short-term decisions**
Objective progress, route progress, cooldowns, combo, pursuit distance.

**Tier 3 — reference information**
Full map, inventory, controls, schedule, mission details, lore.

Tier 1 is immediately readable. Tier 2 is quieter. Tier 3 is usually hidden until requested.

Do not style every datum as an equally important bordered box.

## 3. Full-viewport game composition

The active game should behave like an application mode:

- own the full viewport
- avoid document scrolling
- avoid site navigation and marketing chrome during play
- respect safe-area insets
- keep exit/settings/fullscreen controls minimal
- separate world, HUD, controls, screens, and system overlays

Recommended layer contract:

```tsx
<GamePlayer>
  <WorldLayer />
  <HudLayer />
  <ControlLayer />
  <ScreenLayer />
  <SystemLayer />
</GamePlayer>
```

- `WorldLayer`: game renderer
- `HudLayer`: non-blocking gameplay information
- `ControlLayer`: touch/input surfaces
- `ScreenLayer`: title, pause, settings, tutorial, victory, failure, transitions
- `SystemLayer`: exit, fullscreen, engine settings, devtools

Do not place unrelated interface pieces into one ordinary DOM flow.

## 4. Explicit game layout modes

Do not rely on generic responsive wrapping. Compose explicit modes such as:

- desktop-wide
- desktop-compact
- mobile-landscape
- mobile-portrait

A mobile layout is not a shrunken desktop HUD.

On mobile:

- reserve thumb-control zones
- keep critical HUD out of those zones
- hide keyboard legends
- reduce persistent information
- move Tier 3 information behind contextual panels
- respect browser and device safe areas
- support portrait only when intentionally designed
- otherwise show a polished rotate-device state

All viewport anchoring should live in the game’s top-level UI composition file. Child components own their internal layout, not their screen position.

### Design-resolution fit (`platforms` + `hudFit`)

Design-resolution fit is on by default for every game: each `HudCanvas` auto-scales from `hudFit.designSize` (default 1600×900) down to the live viewport, clamped by `hudFit.minScale`/`maxScale` (default 0.4–1), so the authored layout shrinks instead of overflowing a phone. No declaration needed. `hudFit.mobile` overrides the fit on compact displays only — tune the phone presentation there instead of hand-rolling media queries. The player's Graphics → UI scale setting multiplies the computed scale on every platform. Declaring `platforms: ["web"]` (without `"mobile"`) opts a desktop-only game out; its compact displays keep the legacy fixed 0.85 zoom.

**Overflow is an error, not a style note.** `HudCanvas` measures every `HudPanel` against the viewport at runtime; offenders land in a `data-hud-overflow` attribute (and a console warning), and `bun run shoot <game> --device mobile` (or `both`) exits non-zero naming the escaping panels. A game is not mobile-done while shoot reports HUD OVERFLOW.

### Phase-gated HUD visibility (`showDuring`)

`HudCanvas` and `HudPanel` take an opt-in `showDuring?: GamePhase[]` — the element renders only while `gamePhase` is one of the listed phases (`"menu" | "playing" | "paused" | "ended"`), so a non-cartridge game hides its HUD under menu/end overlays without hand-rolling a phase check. Omit it for the default always-visible behavior. Gate the whole HUD with `<HudCanvas showDuring={["playing"]}>`, or keep a single results panel up with a per-`HudPanel` value. The read degrades to `"playing"` when the component renders outside a `GameProvider` (component showcases, previews), so it never throws there.

## 5. Change the visual grammar

Avoid making every element the same rounded translucent rectangle.

Use genre-appropriate structures:

- clipped corners
- irregular silhouettes
- image-backed frames
- mechanical plates
- radial interfaces
- ribbons and tabs
- gauges and meters
- emblems and decorative corners
- notches and edge anchors
- diegetic objects
- world-space prompts
- asymmetrical compositions
- masks, textures, layered borders, and strong focal elements

Practical rule: no more than roughly 20% of a normal gameplay screen should resemble an ordinary web card or modal.

Every persistent panel must justify why it exists, remains visible, has that shape, and occupies that position.

## 6. Game UI primitives

Prefer small headless or lightly styled primitives over a giant universal design system. Useful concepts include:

- `HudAnchor`
- `StatReadout`
- `Meter`
- `ObjectiveTracker`
- `ActionPrompt`
- `Reticle`
- `MinimapFrame`
- `DialoguePlate`
- `Countdown`
- `BossBar`
- `ItemPickup`
- `DamageIndicator`
- `PauseScreen`
- `ResultsScreen`
- `VirtualControlZone`
- `ScreenTransition`

A primitive should expose game-oriented choices such as shape, material, urgency, placement, hierarchy, entry motion, icon treatment, compactness, and diegetic-versus-overlay presentation.

Do not create a primitive whose only value is wrapping a `div` with border radius.

## 7. Complete interaction states

Every interactive element needs intentional states:

- rest
- hover where applicable
- keyboard/controller focus
- pressed
- selected
- disabled
- success
- failure
- warning

Do not communicate all states with background-color changes alone. Use appropriate combinations of:

- scale compression
- position shift
- edge or glow response
- mask movement
- icon movement
- text response
- brief particles
- sound
- haptics when supported
- controlled shake only when appropriate

Focus must look authored while remaining accessible. Menus should support keyboard/controller-style focus navigation when practical.

## Settings menu

**Settings menu (themed, four layouts, no forced chrome).** The engine builds the whole menu for free — Sound (master + per-bus volume), Graphics (quality/dpr + shadows), Gameplay (FOV slider, default 40–120), Controls (per-action key rebinding, inline click-to-rebind, persisted) — from the game's `audio.buses` and `input` map. What it does **not** do is bolt a fixed gear onto every game: **there is no auto trigger.** You place the entry yourself so it lives *inline with your game's own UI*, never a stray corner overlay. Drop `<SettingsTrigger className=…>` (from `@jgengine/react`) anywhere in your HUD or menu — headless button, `className` for skin/placement, optional `children` to replace the default gear glyph, renders nothing when there's nothing to show. Or call `useSettings().open()` from your own control. Tune the menu via `defineGame({ settings })` (`GameSettingsConfig` from `@jgengine/core/settings/settingsModel`):

- `variant: "panel" | "sheet" | "sidebar" | "fullscreen"` — the layout + skin (default `panel`; `sheet` is the mobile bottom-sheet). All four are fixed-size (no shrink-to-content jitter) and read the game's `--jg-*` theme tokens, falling back to a neutral dark skin.
- `actions: SettingsActionDef[]` — game-state actions (Restart, Quit to menu, …). They become the **first "Game" tab, shown before anything else** — the home for buttons that used to float over the HUD. Each: `{ id, label, kind?: "default"|"danger", description?, run(ctx) }`; the menu closes right after `run`.
- `hideBindings: string[]` — input actions to drop from the rebindable Controls list. A game-state key like `restart` belongs in `actions`, not the rebind grid — hide it here so it stops showing up as a "rebindable" control.
- `surface: "quick"` — additionally mount compact on-screen volume/graphics buttons. Omit for none. `settings: false` — off entirely.
- `extra: GameSettingDef[]` — append rows to any category, built-in *or a brand-new one* named by `category` (any string). Each row: `{ id, label, category, kind: "slider"|"toggle"|"select", default, min?, max?, step?, options?, onChange?(value, ctx) }`.
- `categories: SettingCategoryDef[]` — declare custom category tabs, or relabel/reorder built-ins (`{ id, label, order? }`).
- `hide: SettingCategory[]` — drop built-in categories.

**Game-state controls go in `actions`, never a floating button.** Restart/quit/new-game buttons stapled to the bottom of the HUD are the anti-pattern — declare them as `actions` (first Game tab) and place a `<SettingsTrigger>` inline. A contextual button on a win/lose *results* card is fine; a persistent game-state button pinned over live play is not.

**Present it any way you want.** `useSettings()` (`@jgengine/react`) returns the live controller — `{ categories, actions, variant, surface, isOpen, open, close, setOpen }` — so a game can drive its own pause-menu button, or render `categories`/`actions` (rows carry `value`/`set`/bounds, keybinds carry `rebind`/`reset`) entirely inside its own HUD. `useHasSettings()` gates a custom entry; `useSetting(id, fallback)` reads/writes one value. Set a slider's `min`/`max` explicitly — an omitted range collapses the thumb to 0/1.

## 8. Motion and game feel

Add purposeful motion for:

- screen entry and exit
- confirm and cancel
- warnings
- score increases
- objective updates
- damage
- victory and failure
- countdowns
- pause
- item pickup

Motion should be brief, readable, interruptible when necessary, coordinated, consistent with the game’s art direction, and respectful of reduced-motion settings.

Do not animate everything constantly. Motion communicates hierarchy, cause and effect, urgency, and state changes.

## 9. Mobile controls are genre-authored

Shared input mechanics may remain shared. Their visual treatment and arrangement must match the game.

Examples:

**Driving**
Steering region or wheel, accelerator, brake, handbrake, optional camera/map control.

**Stealth**
Movement zone, sneak/crouch hold, contextual interaction, temporary map/schedule control.

**Shooter**
Movement zone, aim region, fire/action cluster, weapon or ability controls.

**Puzzle/arcade**
Direct drag, tap, swipe, paddle region, or discrete directions. Do not add a joystick without a gameplay reason.

Requirements:

- never cover critical HUD information
- use the game’s shape and material language
- fade training labels after learning
- consider thumb reach
- preserve accessible target sizes
- visually respond to activation
- support optional scaling where appropriate

Do not use one generic translucent controller across all games.

**`presentation: "hud"` games get 3D parity.** A pure-HUD game (no camera rig) now reaches the same input/audio seams as a 3D game:
- **Touch gestures** — the shell mounts a headless `TouchPlaySurface` in the hud branch too, so `touch.gestures` (swipe/tap) reach actions without the game hand-wiring pointer events on its own canvas. The visible dock stays game-authored per the rule above.
- **No phantom reservations** — camera action names (`turnLeft`/`turnRight`/`interact`/…) are reserved *only* when a camera rig is active, so a hud game may bind them directly instead of renaming to `steer*`.
- **Audio actually plays** — audio resumes on the first pointer gesture in hud games (not just 3D), and `playOneShot` self-resumes the suspended context. Trigger sound from anywhere holding `ctx` via `ctx.game.audio.play(soundId, at?)` / `ctx.game.audio.resume()` — the reachable seam over the shell's audio engine.

## 10. Progressive instruction

Do not leave large control grids visible during gameplay.

Prefer:

- contextual prompts
- brief onboarding
- first-use hints
- a controls screen
- pause-menu reference
- icons attached to actions
- progressive disclosure

Desktop keyboard legends must not appear on touch devices. Prompts should appear near the relevant action, object, or HUD region and clear when no longer useful.

## 11. Reference directions for flagship games

### Clockwork Heist

Use gentleman-thief mechanical field-kit language: watch geometry, midnight enamel, aged brass, ivory paper, engraved labels, mechanical shutters, and an authored schedule timeline. The timer should feel like a clock. The schedule should be an on-demand pocket-watch or dossier panel. Touch controls should use brass/enamel construction. Restart belongs in pause, not permanently over the world.

### Canyon Chase

Use desert pursuit language: battered dashboard, analog instruments, radio display, route strip, warning lamps, and road-sign typography. Target gap should read as a pursuit gauge. Border progress should resemble an odometer, route strip, or mile marker. Driving controls should feel like steering, throttle, brake, and handbrake—not generic circles.

### Brick Breaker

Use arcade-cabinet language: bezel framing, CRT/vector treatment, arcade numerical readouts, attract mode, launch feedback, and brief level overlays that clear before play. Pause and results should feel like cabinet states, not web dialogs.

These games must remain structurally distinct, not recolors of one component set.

## 12. Accessibility and performance

Maintain:

- sufficient contrast
- readable text size
- keyboard navigation
- controller navigation where available
- reduced-motion support
- visible authored focus
- touch target sizing
- semantic labels where practical
- responsive scaling
- reasonable DOM and animation performance

Use blur, masks, textures, filters, and full-screen effects carefully, especially on mobile.

## 13. Screenshot verification is mandatory

Capture and inspect meaningful states:

- desktop title screen
- desktop gameplay
- mobile landscape
- mobile portrait where supported
- pause
- victory or failure
- an interaction prompt
- touch controls in active use

Inspect for:

- overlap and clipping
- weak contrast
- unreadable scale
- excessive cards
- website-like composition
- broken safe areas
- conflicting hierarchy
- browser chrome interference
- poor thumb reach
- keyboard instructions on touch devices
- inconsistent art direction

Revise after inspection. Typechecking is not visual proof.

## 14. Rejection criteria

Require revision when any of these are true:

- normal site navigation remains visible during active gameplay
- the player must scroll the page to use the game
- the game is presented inside a normal content card
- essential HUD is covered by touch controls
- controls overlap each other
- keyboard instructions appear on touch devices
- large instruction panels remain visible during gameplay
- more than three ordinary card-like panels are persistently visible
- the main action looks like a standard website button
- pause resembles a generic website modal
- victory/failure is only text plus restart
- restart is permanently visible without a gameplay reason
- menu elements lack pressed, focused, selected, or disabled states
- UI changes have no transition or feedback
- generic virtual controls are used without genre adaptation
- the theme only changes colors and fonts
- unrelated UI elements have equal visual weight
- mobile portrait technically fits but is not intentionally composed
- important UI sits beneath safe areas
- ordinary document flow determines the HUD layout
- generic default styling is used because no art direction was written

## 15. Compact implementation API appendix

Use the main `jgengine` skill for the authoritative engine API routing. The React package exposes `GameProvider`, hooks, and headless primitives from `@jgengine/react` and its documented subpaths. Common hooks include player/game state, entities, stats, inventory, quests, prompts, clocks, markers, fog, and engine stores. The shell provides `GamePlayerShell`, input integration, devtools, and `GameUiPreview`.

Use these APIs to bind state; do not let API wiring dictate visual composition. Keybind labels should derive from the game’s binding table, and UI actions should dispatch through game commands rather than existing only as click handlers.

Headless components are not finished design. They are behavior and accessibility seams that the game must art-direct.

## Definition of done

UI work is complete only when:

- the game owns the viewport
- site chrome is absent during active play
- no document scrolling is required
- HUD and control layers have clear responsibilities
- mobile controls do not cover critical content
- touch controls match the genre and game identity
- title, pause, and results screens feel authored
- interaction states and transitions are present
- screenshots have been reviewed and revised
- the implementation remains accessible and performant
- future generated UI is explicitly prevented from falling back to generic website-card styling
