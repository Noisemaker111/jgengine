`check concept-homes` now covers the games: a game export named like an engine export fails it, so a game imports the engine's version or gives its own thing its own name.

### Changed

- `check concept-homes` scans `games/*/src`, `games/*/packages/*/src` and `games/shared`. Each game is its own namespace (two games may each have a `Hud`); a clash with an engine export fails. The names a game's entry files hand the engine (`game`, `world`, `editorLayers`, `editorCatalogs`, `uiScenario` in top-level `src/` files) are the contract and pass.
- Games use the engine where theirs was a copy: `UiKitName` (`@jgengine/react/uiKits`) in the nine idea games, `FogBounds` in ember-command, `Vec2` in beacon-bastion, `clamp` in odd-orbit (`clampNeed` wraps it), and `openTitle` (`@jgengine/core/game/gameFlow`) inside beacon-bastion's `openKeepTitle` and deepward's `openMarrowTitle`.
- Game-specific things got their own names, e.g. harbor-heat `BeltHotbar`, scrap-signal `WeaponHotbar`, ember-command `TacticalMinimap`/`GlyphIcon`/`factionDamage`, deepward `VisorReticle`/`CommsLine`/`groundDistance`/`tickControls`, brightway-park `CoasterStation`/`tileAt`/`snapToTile`, the idea games' `campWorld`, and llmville's presence aliases (`WorldPresenceTransport`, …), economy (`playerCanAfford`, …) and settings (`GraphicsPreset`).
- `games/shared`: one `dirHasEntries` in `assetStore.ts`, used by `provisionAssets.ts` (was a private copy, and named like the assets CLI's `isPopulated`).

Verification:
- `bun scripts/check-concept-homes.ts --all`: no game entries; only the world/render names remain
- every game's `check-types`: pass
- `bun test` on the touched games, `games/shared` and `scripts/check-concept-homes.test.ts`: pass

## Bends

- None. The entry-export allowance covers only the five names the template writes into top-level `src/` files; the same name anywhere else in a game still fails (tested).
