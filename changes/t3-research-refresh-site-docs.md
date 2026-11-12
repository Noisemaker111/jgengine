jgengine.com home page tells the story: a moving wall of the real games, one playable in the page, the dated decisions with their reasons and numbers (native Rust benchmark included), five ways it is built differently, the stack and the open counts

Root cause: RuneUi.create imported /jg-ui/jg_ui.js from the site root while every other runner file resolves through the installed asset base

### Added

- `runeBundleUrl` (`@jgengine/core/ui/runeUi.view`): The jg-ui module URL, under the app base installed with `setAssetBase`: a runner served from `/play/` loads `/play/jg-ui/jg_ui.js`, not the site root's `/jg-ui/` (which jgengine.com does not serve).

### Changed

- jgengine.com home page tells the story: a moving wall of the real games, one playable in the page, the dated decisions with their reasons and numbers (native Rust benchmark included), five ways it is built differently, the stack and the open counts
- README rewritten so a newcomer can act in five minutes; AGENTS.md states the facts agents get wrong (engine JSX + Rune, plain three.js, no root bun dev); CREDITS names Rune

### Fixed

- Rune UI loads under the app base, so games on jgengine.com/play load /play/jg-ui/jg_ui.js instead of a 404 at /jg-ui
