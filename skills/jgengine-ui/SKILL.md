---
name: jgengine-ui
description: >
  Game UI/UX quality bar for games built on JGengine (@jgengine packages). NOT generic
  card wrappers. USE THIS before writing any HUD, hotbar, modal, or combat feedback for
  a JGengine game. Covers frameless HUD, modal panels (backpack/log only), keybind-native
  UX, ability slot states (cooldown, mana, activation), world VFX vs instant effects,
  orbit camera tuning, and layout rules in GameUI.tsx. Triggers: jgengine, game UI, HUD,
  hotbar, keybind, modal, character sheet, spellbook, cooldown, MMO UX, jgengine-ui.
---

# JGengine — Game UI/UX

Read **`jgengine-api`** for hooks, primitives, and `GameUI.tsx` layout ownership. This skill is **how things should look and behave** — never "put a bordered div around it."

## See what you ship (required)

`@jgengine/shell`'s `GameUiPreview` renders your `GameUI` over a staged `GameContext` (ticks run, hostile targeted, first ability fired) with no gameplay or backend — mount it on a dev route and screenshot it. Judge the image against the quality bar before calling any HUD work done; pass a custom `scenario` to stage richer states (open modals, low health, active quest). Type-green says nothing about whether the HUD renders.

## The card trap (never do this)

| Wrong | Why |
|-------|-----|
| Same `rounded border bg-stone-900/80 p-3` on unit frame, hotbar, gold, quests, toasts | Everything looks identical and cheap |
| Equipment + hotbar inside inventory | Breaks MMO mental model — three different systems |
| Icon menu with no key labels | Players can't learn bindings |
| `effect({ to })` for bolts | No travel time, no readable combat |
| Error text in a floating card toast | Use ephemeral combat-float text instead |

## Panel vs frameless

**Gets a modal/panel chrome** (backdrop + bordered window):
- Backpack / bags
- Combat log / chat feed

**Stays frameless** (typography, bars, icons, shadows only — no enclosing card):
- Player unit frame
- Target frame
- Action bar / hotbar
- Quest tracker (text column)
- Currency (coin + number inline)
- Floating combat/error text (fade up, no box)
- World projectiles and hit VFX (Three.js / canvas layer)

## MMO-native keybinds

Every toggle and hotbar slot shows its binding. Register in `defineGame.input` and wire in the shell via `game.commands` (never duplicate logic in UI click handlers only). Before shipping, read the full binding table once and check **one key, one action** — a crouch toggle on `C` and a character sheet on `C` is a shipped bug, not a style choice.

| Action | Typical binding |
|--------|-----------------|
| Backpack | `B` |
| Character sheet | `C` |
| Abilities / spellbook | `K` or `P` |
| Tab target | `Tab` |
| Clear target | `Esc` |
| Hotbar slots | `1`–`9` |
| Hotbar scroll | mouse wheel over action bar |
| Primary ability | `mouse0` |

Pattern: `ui.openBackpack` command toggles panel state; shell calls `commands.run` on `wasPressed("openBackpack")`. UI subscribes to the same state store the command mutates.

## Action bar slot states

Each slot must communicate four states visually:

1. **Ready** — full color icon
2. **Cooldown** — dim icon + radial or top-down sweep + numeric timer
3. **No mana** — red tint / desaturate (check `manaCost` vs current mana before press)
4. **Just cast** — brief bright ring flash (~200ms)

Cooldown data lives in game code (`combat/abilityCooldowns.ts` or similar); UI reads it, engine does not own cooldowns yet.

## Combat feedback

| Effect type | Presentation |
|-------------|--------------|
| Bolt / bullet | `fireProjectile` + delayed `settleProjectile`; `WorldOverlay` renders traveling mesh |
| Melee swing | short arc VFX at player facing (optional) |
| Instant heal | green flash on unit frame bar |
| Out of range / oom | floating text at screen center-bottom, fades in 2s — **no bordered toast** |

## Modal structure

```
ui/
  GameUI.tsx              grid zones + modal backdrop host
  uiController.ts         panel open state (subscribe store)
  components/
    BackpackModal.tsx     items grid only
    CharacterSheetModal.tsx  stats, level, equipment paperdoll
    AbilitiesModal.tsx    full spell list + keybind per row
    CombatLogPanel.tsx    panel chrome OK here
    Hotbar.tsx            frameless slots
    PlayerFrame.tsx       frameless bars
    KeybindBadge.tsx
    FloatingCombatText.tsx
  combat/pendingProjectiles.ts  shot queue + bolt visual state
  combat/<Game>ProjectileOverlay.tsx  R3F meshes; wire via PlayableGame.WorldOverlay
```

Inventory modal: **backpack slots only**. Character sheet: **equipment + stats**. Abilities page: **catalog abilities with costs/cooldowns/keybinds** — not the hotbar duplicate.

## Layout

All screen positioning in `GameUI.tsx` only. Use CSS grid zones. Modals: full-viewport `fixed inset-0` backdrop (`bg-black/50`) + centered window.

## Orbit camera (game player shell)

`@jgengine/shell` ships `GameOrbitCamera` (`@jgengine/shell/camera`) — `GamePlayerShell` wires it automatically:

| Input | Action |
|-------|--------|
| Left drag | Orbit around player target |
| Scroll | Zoom in/out (dolly) |
| Left tap (no drag) | Primary ability (`useAbility` / mouse0) |
| Shift + scroll | Hotbar slot scroll (when game registers `ui.hotbarScroll*`) |

Movement uses camera yaw from `orbitYawFromCamera` so WASD is camera-relative. Per-game tuning via `PlayableGame.camera` (`minDistance`, `maxDistance`, `targetHeight`, …). Do not hardcode camera position in `onTick` when orbit mode is active.

**cameraFollow lock** — camera + target translate with entity delta; orbit radius re-locks via exponential lerp (`distanceSmoothing`), not hard snaps. `followLock: true` (default). Tune feel with `rotateSpeed` (~0.38), `zoomSpeed` (~0.62), `dampingFactor` (~0.07), `targetSmoothing`, `distanceSmoothing` on `PlayableGame.camera`. Optional `onCameraFollow` callback fires each frame with `{ entityId, target, camera, distance }`.

## Self-check

Run against actual screenshots of the staged `GameUiPreview`, not your mental model of the code:

- [ ] Could you screenshot unit frame and hotbar and mistake them for the same component? If yes, redo.
- [ ] Does every toggle show a key label?
- [ ] Do bolts visibly travel before damage?
- [ ] Is backpack the only bag UI, with no hotbar inside it?
- [ ] Only backpack + log have panel borders?
- [ ] Does every declared system have its UI end state — quest → tracker, cooldown → sweep + timer, error → floating text? A wired hook with no visual is half a system: finish it or cut it (see `jgengine-workflow`).
- [ ] Does the staged-scenario shot show the HUD *working* (target locked, cooldown mid-sweep, tracker populated) rather than resting-empty?
- [ ] Would a player think this is intentional art direction? If it looks like a debug build, it ships nothing.