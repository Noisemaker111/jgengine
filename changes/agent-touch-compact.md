### Changed

- The touch dock's right-thumb cluster is shooter-shaped: one big main button (the `fire`/`shoot`/`attack` action, or a `touch.buttons` spec marked `main: true`) in the corner with secondaries on tight arcs around it, sized from the screen's short side. The old wrapping grid of large buttons is gone.
- Every touch button shows an icon or a 1–3 character glyph, never its label text: shooter verbs (fire, aim, reload, grenade, heal, skills, ability) get glyphs, unknown actions get initials, and `TouchButtonSpec.icon` takes a `GameIconName`, a touch glyph or a short text glyph. The label stays as the accessible name.
- `selectSlotN` (and `equipSlotN`, `weaponSlotN`) actions collapse into one row of small numbered chips (`TouchScheme.slots`) instead of a big button each.
- Menu-type touch actions (`openSkills`, `toggleMap`, …) render as small icon chips beside the slot row, folded into a `⋯` overflow chip past two; `layout.utility` now defaults to `bottom-right`.
- The dock reserves only the bottom corners it occupies: the shell publishes `--jg-hud-dock-clearance-left|center|right` and `HudCanvas` lifts each bottom region by its own value, so bottom-centre HUD is no longer pushed up.
- The default `glass` touch skin reads the game's HudTheme tokens (`--jg-surface-deep`, `--jg-text`, `--jg-accent`).
