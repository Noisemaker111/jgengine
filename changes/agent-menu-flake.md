The menu no longer pulls focus back from a field the player just moved to, and its keyboard test waits on frames instead of timers.

### Fixed

- `GameMenu` (`@jgengine/react/menu/gameMenu`): its focus effect runs a frame after the highlight changes and used to grab focus whenever focus sat outside the menu, so a Tab to a text field (or hovering an item while typing) in that frame lost the field's focus. It now only takes focus when nothing has it. This was the cause of the `menuNav.test` Tab case failing now and then in CI (#2529): with a slow runner, the menu's frame landed after the Tab.

Verification:
- `bun test packages/react/src/menu/menuNav.test.ts`: 11 pass, three runs in a row
- the new "hovering the menu while a field has focus" test fails without the fix (focus lands on the body) and passes with it
- waits are `requestAnimationFrame` frames, not `waitForTimeout`

## Bends

- None. No assertion was relaxed; the timer waits became frame waits and one regression test was added.
