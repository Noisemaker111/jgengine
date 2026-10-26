jgengine.com now sells what a developer gets: "Build three.js games 10x faster", with a real, type-checked snippet and a live capture for each thing the engine does for you, on a new dark/light game-engine theme.

### Changed

- Home is rebuilt around the builder: one-command start, a HUD that fits phones with touch controls, saves, walking/driving/flying, physics with an optional Rapier backend, systems with knobs, load numbers and agent tooling. Games are proof in the background, not the headline.
- The home page's code lives in `apps/web/src/snippets/` as real files that `apps/web` check-types compiles against the engine source, so a snippet that stops building fails CI.
- New theme: Archivo display type, an editor-style grid, orange accent, axis-tick eyebrows; both colour schemes and phone width reviewed. Bricolage Grotesque is replaced by Archivo.
- Every page's copy rewritten plainly and checked against the code: games, game page, playground, editor, capabilities (now with the blueprints), why, adopt, 404, site title and description.
- Load numbers on the site come from `scripts/load-baseline.json` (`apps/web/src/lib/siteFacts.ts`), not hand-typed.

### Added

- Nine games that were playable but missing from the site (Apex Nights, Briarcrown, Fernwild, Hold the Line, Orbit Watch, Outpost Zero, Red Frontier, Saltwick, The Sunken Crown) get a `games/README.md` row and a cover.
- Game cards show the one-line idea a game started from, read from its README.

### Bends

- None.
