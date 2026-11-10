# Deepward Rune UI

Brief: Rune for all UI, no CSS, no React or Solid. Keep beta's visor and Marrow console appearance.

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

## Direction

Use the engine JSX reconciler with a direct native host. Games author typed element props; Rune owns layout, paint and interaction. The existing CSS mirror remains for other games and is never used by Deepward. The DOM host is optional tooling only.

## Features

- JSX, state, context and effects: `packages/core/src/ui/jsx/`.
- Native layout, paint, live slots and events: `packages/core/src/ui/rune/`, `native/crates/jg-ui/src/spec.rs`, `style.rs` and Rune element API.
- Settings data and persistence: `packages/core/src/settings/`.
- Menu navigation and save slots: `packages/core/src/menu/`, `packages/core/src/save/`.

## Milestones

- [x] Typed native element props and direct host, with no hidden DOM or computed style reads.
- [x] Whole Deepward UI migrated; game CSS and CSS authoring removed.
- [ ] UI skill and concrete second-game migration instructions; Linux checks and wasm bundle.
- [ ] PC evidence: HUD, menu and settings at desktop/phone widths; one production CPU/GPU comparison against beta's React UI; static UI has no draws.
- [ ] Rebase after #3108 lands, then one PR through `lane:close`.

## Verification still required

Headless native PNGs run on Linux through the production Rust builder. They check UI layout and paint without a browser; they do not establish parity with beta.

This Linux host has no GPU, Owl or Jon's Chrome. Real-game screenshots and CPU/GPU measurements require a PC thread. Do not claim visual parity, static zero draws or lower cost until those artifacts exist. Baseline React revision: `d7fdf21a5f0f62c4f13747e253cf1d59149fdc07` (beta at task start). PR #3108 is still open at task start.

## PC acceptance work

- Run `bun run drive deepward --flow ui-tour` at desktop and phone widths. It checks a settled settings screen submits no native frames and captures title, settings and HUD. Use distinct output names for both widths.
- Compare those six shots with the same states and dimensions at the pinned React baseline. Fix any differences, including material texture/scanlines, HUD fade, low-air pulse and phone haul placement. The native settings fixture uses a stub controller; check the real categories in game.
- The game declares landscape/web and no touch; confirm phone-width evidence reaches the UI rather than an orientation gate.
- Measure one production round against the pinned React baseline. Attribute UI CPU and GPU cost per frame; total game frame time alone does not establish UI cost. Record both numbers and the method in the PR.
- The generic CSS-mirror material proof moved to Brightway Park, which still uses that path. It must not inject CSS into Deepward.
- Once acceptance passes and #3108 is merged, rebase onto beta and run `lane:close` once.
