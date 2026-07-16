---
name: jgengine-ui
description: Game-first HUDs, menus, touch controls, motion, accessibility, art direction, and visual verification.
---

# jgengine-ui

**Import from the curated barrel** `@jgengine/core/ui` for core UI helpers (format, HUD, settings); React/render surfaces come from `@jgengine/{react,shell}` package roots. Deep paths `@jgengine/core/<domain>/<file>` still work for anything not re-exported.

Use this skill for the **visual and interaction design of the game interface**: title screens, HUDs, menus, prompts, maps, inventories, dialogue, touch controls, transitions, pause/results states, accessibility, and screenshot critique.

Do not use this skill as a React, routing, state-management, or hooks reference. The main `jgengine` skill owns routing and points to the engine APIs. When implementation needs `@jgengine/react` hooks or shell APIs, follow the links in the main skill and the compact API appendix in [reference.md](reference.md); keep this skill focused on what the player sees and feels.

## Required outcome

A JGengine game must read as a self-contained game, not a responsive website with a canvas inside it.

Before shipping UI:

1. Give the game a concise UI art direction.
2. Compose explicit desktop/mobile game layouts instead of document flow.
3. Keep persistent HUD information sparse and hierarchical.
4. Adapt touch controls to the genre and reserve their screen zones.
5. Implement authored focus, pressed, selected, disabled, success, failure, and warning states.
6. Add purposeful motion and feedback.
7. Capture screenshots and revise what actually renders.

## Ownership boundary

The main `jgengine` skill owns intake, engine architecture, API routing, hooks, commands, state, and verification routing. This skill owns presentation quality.

Read [reference.md](reference.md) when building or reviewing a game interface. It contains the implementation quality bar, layout rules, art-direction template, touch-control requirements, acceptance criteria, and the compact existing React API surface.

## Non-negotiable defaults

- Active play owns the viewport; no marketing header, page title bar, document scrolling, or website container.
- The game builds its own main menu (unique per game) and its own in-game menus (pause, settings, results). The hosting site page (`apps/web`) is a loader only — spinner until `/play` is ready, no title/tagline/CTA of its own. One menu per game, and the game owns it.
- Screen placement belongs in the game's `ui/GameUI.tsx` composition layer.
- Persistent gameplay information is frameless unless a physical/diegetic frame is part of the game's art direction.
- Instructions are contextual and temporary, not permanent keyboard grids.
- Keyboard/mouse hints never render on touch. A touchscreen has no keyboard, so a key legend is pure noise that fights the on-screen controls for space. Wrap every key cap + its meaning in `KeyHint` (from `@jgengine/react`) — it renders nothing on coarse pointers and is also hidden by an engine stylesheet as a hydration-safe backstop; use `Keycap` for the cap itself. For a hand-rolled hint that can't use the component, tag its container `data-jg-kbd-hint`. Put the touch equivalent (a `TouchControls` dock, a tappable button) on the coarse branch. This was the "keybinds still showing on mobile" bug. For a whole controls legend, reach for `ControlsList` (from `@jgengine/react`): pass `bindings={keybinds}` plus `controls={[{ action: ["throttleUp","throttleDown"], label: "Throttle" }, { keys: "Mouse", label: "Aim" }]}` — glyphs come from the keybind map (one source, never re-typed), and the whole list hides itself on touch. Wrap a title/attract overlay in `StartScreen` (headless `data-jg-menu` scaffold, opt-in `settings` corner, game supplies and skins the content).
- Bottom-edge HUD goes through `HudCanvas`/`HudPanel` (`anchor="bottom*"`), never hand-positioned `absolute bottom-*`. The shell mounts the touch-control dock along the bottom and publishes its height as `--jg-hud-dock-clearance`; only `HudPanel` regions honor it, so hand-positioned bottom panels land *on top of* the joystick and action buttons — and, because they never register a layout region, the collision detector can't even warn. Route corner/edge panels through `HudPanel` so they auto-stack, clear the dock, and become visible to collision detection. This was the "menus stacked over each other at the bottom" bug.
- **Canvas mode (`F2+C`)** drags/resizes HUD into `editor.scene.json` → `ui.panels`. TSX props fallback-only. From `@jgengine/core/ui/hudDocument`: `registerHudPanelType`, `listHudPanelTypes`, `resolveHudPanelLayout`, `resizePanelSize`. RPCs: `canvas_move_panel`, `canvas_resize_panel`.
- Mobile controls share input mechanics but not one universal visual skin.
- Themes change geometry, composition, typography roles, icons, motion, materials, sound, and density—not only colors.
- Ordinary rounded cards, pill buttons, generic dark modals, and dashboard grids are fallback failures, not defaults.
- HUD numbers go through `@jgengine/core/format` — `formatDuration`/`formatDelta`/`formatOrdinal` (clocks, splits, ranks), `formatSpeed` (m/s → km/h/mph/knots), `formatDistance` (m/km) — never a hand-rolled `Math.round(x * 3.6)` or `mm:ss` string. Two games once diverged on the m/s→km/h factor (3.2 vs 3.6) because each hand-rolled its own conversion; the shared functions are the one correct table.

## Dialogue panel

Render talkable-NPC dialogue with `DialogueBox` (`@jgengine/react/components`) over the `features.dialogue` bridge — no per-game open/close store. `useOpenDialogueId()` returns the id `ctx.game.dialogue`/a `talkable(id)` prompt has open (or `null`); look it up in the game's dialogue catalog and pass it. Route a click with `runDialogueChoice(commands, choice, result)` (resolves the choice's invoke — honoring a skill-check `result` — runs it, else closes), or call `resolveDialogueInvoke(choice, result)` yourself for custom routing. A whole panel:

```tsx
const id = useOpenDialogueId();
if (id === null) return null;
return <DialogueBox dialogue={DIALOGUES[id]} onChoice={(c, r) => runDialogueChoice(commands, c, r)} className="…" />;
```

Style through `DialogueBox`'s class-name props (`speakerClassName`, `choiceClassName`, …) — it ships structure, the game ships the skin. See `jgengine-gameplay` for the `dialogues.ts` catalog shape and `features.dialogue` wiring.

## Save / load UI — `useSaveStore`

A save-slot menu, a "Continue" button, or a live "Saving…" indicator all read from `useSaveStore(store)` (`@jgengine/react/save`), the React binding for the engine's `@jgengine/core/game/saveStore` (see `jgengine-gameplay` → "Whole-game save"). It returns the live `value`, a `status` (`"saving"`/`"saved"`/`"error"`) to skin an indicator or a spinner off, and `save`/`clear`/`set`/`patch` actions — and it loads once on mount so a title screen can gate "Continue" on whether a save exists. Presentation only: the same hook backs an offline (localStorage) or cloud (Convex) save with no UI change, so build the menu once.

## Preview states ship with the UI

Every game ships `src/preview.tsx`: a static default frame plus a `states` named export (`GamePreviewStates` from `@jgengine/react/preview`) keying named UI states — `stage_1`, `game_over`, `boss_intro` — to components. The website card uses a captured real-gameplay screenshot instead, not this component. Build state entries from the game's **real UI components** with fixture snapshots (canned props/state), not redrawn lookalikes; that turns every key into a capturable render test. Capture any state instantly with `bun run shoot <game> --preview <stateKey>` — no sim, no three.js, no hang risk — and use it as the screenshot-critique loop for HUD/menu/overlay work before any full-shell `--mode ui`/`play` glance. Live-sim screens (a running match, a real store with live state) are the other capture family: declare them as `PlayableGame.capture.states` and shoot with `--state <name>` — see `jgengine-verify`.

## Rejection test

Reject and revise the UI when it could be mistaken for a SaaS dashboard, landing page, admin panel, documentation page, or generic emulator overlay.

## Visual quality bar — the world, not just the UI

"Make the starter area / terrain / environment look better" is a screenshot-judged loop, not a data task:

0. **The default look is already cinematic (#773).** A 3D game gets a real sky, a shadow-casting sun+hemisphere rig, and a tuned post stack out of the box — `look` unset means `"cinematic"`; `defineGame({ look: "flat" })` opts out to the bare rig. So "no sky, flat light" is now a symptom of an explicit `look: "flat"` or a HUD-presentation game, not the default. Reach for the rest of the art stack on top of the preset; see `reference.md` → "Rendering".
1. **Look first.** `bun run shoot <id> --mode play` (or `bun run drive <id> --click ... --shot before` for menu-gated games). Judge the shot like a player seeing a store page: flat single-color ground, default-grey materials, no sky treatment, empty horizon = "doesn't look like a game" — say so plainly and treat it as failing.
2. **Use the whole art stack, not one knob.** Sweep every layer before declaring done: terrain texture + height/color variation · materials on props and buildings · lighting + daylight cycle (`@jgengine/shell` environment) · sky, fog, and distance treatment · post-processing chain (composer seam) · vegetation volumes (density slider, tree/bush/grass items) · props, landmarks, and silhouettes that give the space identity. Asset catalogs (`jgengine-assets`) before hand-rolled geometry.
3. **Re-shoot and re-judge at milestones** — after each layer lands, not per-tweak. Stop only when the shot reads like a shipped game in the target art direction.
4. **Prove content in data, beauty by eye.** `summarizeEnvironment` assertions still gate that trees/props/zones exist; screenshots are the only gate for whether they look right. Before/after shots go in the PR body.
5. **Keep the mechanics of iterating cheap; keep the judgment at milestones.** Re-shooting per milestone (not per tweak) already caps iteration count — cut what each iteration costs too: scope typecheck to the touched game (`bun run --cwd Games/<id> check-types`, ~5s, not the full `check-types` gate), keep the dev server and Chrome warm across the loop (`shoot`/`drive --keep` once, then `--connect 9223` every re-shot — <10s instead of a ~90s reboot), and take mid-loop judge shots at half-res (`--size half`, ~1/4 the image tokens); reserve full-res, no `--connect`, for the milestone/PR shot. Full flag recipe and rationale: `jgengine-verify` → "The warm loop".

Reject test for worlds: if the screenshot could be mistaken for a physics-demo sandbox or an untextured prototype, it fails the bar.

A "premium"/"shipped" verdict on this bar reports as the done-ledger (`jgengine-verify` → "The done-ledger"), `score`/`pixel` rows present — never "looks great" alone. The `score` row is [`references/visual-scorecard.md`](references/visual-scorecard.md): a fixed 0–3 rubric across 10 categories (art direction, hero/player, obstacles/enemies, rewards/interactables, world layering, materials, lighting, VFX/motion, UI/HUD, performance evidence), premium/showcase pass thresholds, an automatic-failure list, and the fresh-eyes take-the-lower-score reconciliation — apply it at milestones and carry the reconciled table into the done-ledger and PR body.

## Render authored scenes, don't hand-roll them

Scene content authored in the editor renders at runtime through `@jgengine/shell/scene`: mount
`<AuthoredScene document={doc} field={ctx.world.ground} placeObjects />` for paths (`AuthoredPaths`),
foliage, studios, and catalog props (`AuthoredObjects` — markers with `catalogId`/`meta.catalogId` →
object store; WorldScene draws via `objectModels`). Or `<AuthoredObjects document field />` alone.
Headless: `resolveAuthoredObjects` / `placeAuthoredObjects`. See CLAUDE.md → "Author scenes in the editor".

Scatter: `InstancedScatter` proxies by default — pass `scatterModels={{ pine: "…" }} assets={assets}` on
`<AuthoredScene>` for real GLBs. Same `resolveModel` / `createModelMapResolver` as `entityModels`/
`objectModels`.

## HUD components — blank baseline, opt-in widgets

The engine imposes **no** HUD. Every game's HUD is its own `GameUI`; a bare game renders nothing. `new:game` scaffolds an **empty** `GameUI` (a commented `HudCanvas`), and a game opts into drop-in widgets from `@jgengine/react` — each self-styled (inline CSS, no Tailwind `@source` needed), cohesive dark-glass look, reads the local player by default, override via `style`/`className`:

- `<StatBar statId tone label />` — health/mana/stamina/shield/xp bar (tone-colored).
- `<Hotbar inventoryId activeSlot keys />` — numbered slots + active highlight.
- `<Speedometer scale unit max />` — SVG arc gauge of an entity's ground speed.
- `<Clock format showDay controls />` — Day N · HH:MM; `controls` adds pause + speed pills.
- `<WaveBanner wave subtitle />` — a round/wave callout.
- `<Coins currencyId icon />` — live currency counter.
- `<Crosshair />` — center reticle.

Place them in `<HudPanel anchor="…">` inside the `<HudCanvas>` (see `apps/dev/src/demo/hudDemo.tsx`). Don't reach for a per-game hand-rolled health pill — use `StatBar`. Never mount a fixed overlay onto every game (composable, never imposed).

## Cinematic studio shots — StudioStage + film grade

A parametric studio (a generator asset, a scene kind) reads as shipped, not intern-tier, only with lighting + a film grade — the geometry alone under default light looks like a proxy. Two reusable pieces:

- **`STUDIO_STAGE_POST`** (`@jgengine/core/render/postProcessing`) — a tuned post preset (soft bloom, contact AO, warm grade, faint grain; vignette off) for a product/cinematic shot. Set `PlayableGame.postProcessing = STUDIO_STAGE_POST` (add `dof` for background blur).
- **`<StudioStage mood backdrop turntable environment faceCamera forward>`** (`@jgengine/shell/scene/StudioStage`) — a 3-point lighting rig (key/fill/rim + ambient) + seamless backdrop + optional turntable. Wrap studio content in it for a hero shot; `environment={false}` uses it as a lighting rig over an open-world scene. Moods: `studio | daylight | dusk | night`.

Product shot = a **bare** game (no `content`/`stats`/`inventories`/`time` → no gameplay HUD; chrome is data-driven and composable, never imposed) + a `turntable` camera + `StudioStage` + `STUDIO_STAGE_POST`. See `apps/dev/src/demo/bookcaseStageDemo.tsx`.

**Frame the front automatically, don't hand-tune `rotationY`.** A generator/scene-kind declares which way it faces (`GeneratedAsset.forward`, default +Z — see `jgengine-assets` rule 10). Set `StudioStage`'s `faceCamera` and pass that declared `forward` (default `[0, 0, 1]` if omitted) — it yaws the content every frame so the front points at wherever the camera currently is, including an orbiting `camera.turntable` rig. `faceCamera` and the stage's own `turntable` spin are mutually exclusive (`faceCamera` wins): one spins the object, the other holds it facing the viewer. This is what replaced `bookcaseStageDemo.tsx`'s old hand-tuned `rotationY={Math.PI}` (#816).

The schema inspector (#809) supports **collapsible groups** (`schema.groups` + `field.group`) and per-group **randomize / reset action buttons** (`{ type: "action", action: "randomize", group }`) — a studio panel reads like a pro tool (Carcass / Books sections with 🎲 randomize), not a flat slider dump.

## `@jgengine/react` surface (import inventory)

Deep path preferred (`@jgengine/react/hooks`, `/provider`, `/components`, …); package root re-exports the same names. Orphan gate tokens — public hooks/components games may adopt:

`useGameStore` `useGameStoreValue` `useGame` `usePlayer` `useGameContext` `useOptionalGameContext` `useGamePhase` `useOptionalGamePhase` `useGameClock` `useSceneObjects` `useSceneEntityIds` `useLocalPlayerDead` `useNearestWorldItem` `useLeaderboard` `useRoster` `useChat` `useChatBubbles` `useEntityChatBubble` `useFriends` `useFriendRequests` `useParty` `usePartyInvites` `usePresence` `useWorldInvites` `useWorldBrowser` `useFog` `useAxisChannel` `useHeldKeys` `useAuthedPlayer` `useSession` `useHudViewport` `useGameOrientation` `useLayoutCollisions` `useReservedControlZones` `useViewportMetrics` `useFrameBind` `createHeldKeyTracker` `abilityKitNeedsHeartbeat` `eventMeterNeedsHeartbeat` `hudVisibleInPhase` `CaptureOdds` `ChannelTabs` `ChatInput` `ChatLog` `DeathScreen` `DragGhost` `GameIdentityProvider` `KeybindRow` `PartyMemberRow` `PresenceDot` `QteTrack` `RequireSession` `SignOutButton` `SpeakingIndicator` `UserBadge` `LiveText` `betterAuthIdentity` `clerkIdentity` `guestIdentity` `chatTransportFromSync` `latestChatBubbles` `isRedSuit` `iconForItemId` `frameBindSubscriberCount` `subscribeFrameBind`

