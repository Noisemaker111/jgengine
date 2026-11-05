A Beacon defense survives a page reload mid-run, and a HUD shows when play starts from a title menu

Root cause: Beacon wrote a defense to disk only when the player chose Save or withdrew, so a reload mid-run lost it. Separately, HudCanvas measured its viewport only on first mount, so a run started from the title menu had no HUD and no way to start the first assault.

Prevention: hudShowDuring.view.test.ts and the reload-mid-run Beacon flow both fail when their fix is removed.

Closes #2246

### Fixed

- A Beacon defense saves itself once a second while playing, so a page reload mid-run continues into the same towers, purse, wave and raiders (about 0.2 ms and 12 KB per write on a busy defense).
- Opening or raising another Beacon keep never overwrites the keep left behind, and a keep changed in another window is left alone instead of overwritten.
- A HUD gated by `showDuring` shows its panels when play starts from a title menu.
- A failed capture is retried from its evidence instead of stopping after two attempts.

### Added

- `SaveStore.switchSlot(slot, { flush: false })` opens a slot without writing the current state first.
- Beacon's HUD says when a defense is not being saved, and its pause menu offers Withdraw without saving for it.
- The `reload-mid-run` Beacon flow raises a keep from the title, builds, starts wave 1, reloads the page and continues into the same defense.
