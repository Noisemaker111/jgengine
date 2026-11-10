# Deepward Rune primitives

Jon's latest direction: Rune-native game UI with a high-level composition API.
No finished widgets or screens in the new engine API; no game DOM, CSS, React or
Solid. Deepward owns its screens and look. Old-UI pixel parity and the UI-kit plan
are superseded. All work stays in PR #3117, landing after #3108.

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite deepward`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 0/2 | 0 | 0 | 2 | 0 |
| failure | 0/1 | 0 | 0 | 1 | 0 |
| save | 0/1 | 0 | 0 | 1 | 0 |
| settings | 0/1 | 0 | 0 | 1 | 0 |
| menu | 0/1 | 0 | 0 | 1 | 0 |
| progression | 0/1 | 0 | 0 | 1 | 0 |
| content | 0/5 | 0 | 0 | 5 | 0 |
| extraction | 0/4 | 0 | 0 | 4 | 0 |
| **total** | **0/16** | 0 | 0 | 16 | 0 |

<details><summary>Every required entry</summary>

Genres: extraction. 0/16 proven · 16 missing.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | missing | A new game shows a first goal, and the first player action toward it advances it. |  |
| `onboarding.find-features` | missing | A player following the game's own guidance reaches the first use of every core feature. |  |
| `failure.lose-and-recover` | missing | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. |  |
| `save.continue` | missing | Progress made by playing survives saving and continuing. |  |
| `settings.controls` | missing | The player opens settings and a change (a binding, volume, sensitivity) takes effect. |  |
| `menu.start-and-credits` | missing | The main menu starts a game and shows the credits. |  |
| `progression.runway` | missing | Something new unlocks steadily across the first five hours, up to the progression cap. | no content sheet (proofs/content.ts) |
| `content.item-source` | missing | Every item can be obtained by playing. | no content sheet (proofs/content.ts) |
| `content.item-use` | missing | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | no content sheet (proofs/content.ts) |
| `content.recipes-reachable` | missing | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | no content sheet (proofs/content.ts) |
| `content.placeables-place` | missing | Every item that says it can be placed can be placed. | no content sheet (proofs/content.ts) |
| `content.weapons-have-ammo` | missing | Every weapon that fires has obtainable ammo, or needs none. | no content sheet (proofs/content.ts) |
| `extraction.enter-run` | missing | Go into a run with chosen gear. |  |
| `extraction.carry-limit` | missing | What can be carried out is limited by space or weight. |  |
| `extraction.extract-bank` | missing | Reaching an exit banks what was carried. |  |
| `extraction.die-lose-carried` | missing | Dying in a run loses what was carried. |  |

</details>
<!-- /suite-score -->

## Shared owners

Native JSX, layout, bindings and input: `packages/core/src/ui/rune/` and
`native/crates/jg-ui/src/native.rs`. Flow uses `dialog/modalStack.ts`; pause and
capture use `game/controlGate.ts` and the simulation clock. Transient records
reuse the existing notice feed. Settings use the existing controller; records,
stash, fabricator and cache keep their game commands and persistence.

## Milestones

- [x] Publish the design, types and examples at the top of #3117 before implementation.
- [x] Native layout, anchors, responsive overrides, all visual property bindings,
  keyed sources, formatting, command actions, focus/navigation, holds, drag/drop,
  hover/tooltips, flow leases/transitions, transient/world presentation and themes.
- [x] Replace Deepward's old HUD and menu composition. Keep only game presentation
  and game-specific panels. Delete new engine meters, dial, slider, settings screen
  and HUD wrappers introduced by the earlier plan.
- [x] Update the UI skill with the primitives and a page-sized game example.
- [x] Inspect desktop/phone headless PNGs of title, settings and HUD; repair phone
  reticle overlap and split action labels. These show native UI, without a 3D scene.
- [ ] Finish Linux generation, verification, commit and push the final source/wasm.
- [ ] PC acceptance: run the real controls and settings, confirm idle draw submissions
  stop, and measure production UI CPU/GPU cost. No cost claim before this step.
- [ ] Rebase onto beta after #3108 merges, then land once through `bun run lane:close`.

## Evidence

The previous implementation had 728 UI TSX lines (excluding tests); the primitives
rewrite has 372. Count all `src/game/ui/**/*.tsx` files, including the game theme
and specialised panels. Pixel parity is not a goal.

Six inspected PNGs live in `proofs/rune-primitives/`: title, settings and dive at
1280×720 and 390×844. The settings fixture contains deterministic controller rows;
it does not prove the real controller's complete categories or persistence.

Focused tests cover live colors/fractional sizes/text without component renders,
keyed identity, responsive safe bounds, projection visibility, command invocation,
rich/localised text, native gestures, holds, navigation and nested flow ownership.
The hold regression was deliberately introduced: its early-release test failed,
then passed after restoration. Rust proves atomic addressed patches, sibling
revision isolation and no further commits, motion or wakes after a native UI settles.
The actual GPU submission counter still requires the PC.

## PC acceptance brief

Use branch `agent/rune-native-ui`, PR #3117. Keep the PR open until #3108 has
landed; then rebase onto beta. Do not bring back CSS, a DOM host or finished widgets.

Run `bun run drive deepward --flow ui-tour` at desktop and phone widths. The flow
captures title/settings/HUD and checks that `window.__jgNativeUi.stats().frames`
stops after settings settles. Exercise a real setting, category and key rebind;
start/continue, pause/resume, save/load, credits, stash, cache move/rotate/drag/drop,
fabrication, reprint and save-failure boundaries. Check mouse, keyboard, pad and
touch gestures where the game permits them. The host has no Owl/GPU/Chrome.

Measure one production round of UI CPU/GPU cost against the React baseline
`d7fdf21a5f0f62c4f13747e253cf1d59149fdc07` using the existing perf harness. Attribute
UI work separately; a total frame-time number is insufficient. No pixel matching.
Record the numbers and method in #3117, then run `lane:close` after acceptance.

## Linux verification state

Focused TypeScript tests and core/UI/Deepward types pass. The production wasm
bundle was rebuilt after native changes. Generation and the final broader receipt
are pending in this edit.

The earlier `verify:fast` receipt was incomplete, not a passing gate. Its unchanged
baseline blockers were Bun 1.3.14 caching a dead `HTTP_PROXY` in localhost probe
tests (CI declares 1.4.2) and a missing LLMville perf budget. Do not weaken those
checks or invent a perf baseline. Current results must replace this historical
state before landing.
