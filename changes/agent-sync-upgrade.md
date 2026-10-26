### Migrate

- `jgengine upgrade` is gone. Run `npx jgengine@latest sync` instead: at a game it brings the game to that engine; at a workspace root it moves the root catalog's `@jgengine/*` pins, then syncs every member game. It prints the release notes (Migrate first, then Adopt) for the versions it crossed.
- Template games no longer carry `scripts/browser.mjs`, `scripts/shoot.mjs` or `scripts/drive.mjs`. Run `jgengine sync` once: it deletes the old copies (unless listed in `owns`) and points the `shoot`/`drive` scripts at `jgengine shoot`/`jgengine drive`.

### Changed

- `jgengine sync` takes over everything `upgrade` did: workspace catalog updates (keeping range prefixes, a held editor override and each game's `catalog:` declarations; refusing a downgrade), `--check` for CI, and release notes for the span crossed.
- `shoot` and `drive` always run the CLI's own bundled harness. When nothing is serving the game, the harness starts the project's vite through its JS entry with the current Node, so it no longer fails with `spawn EINVAL` on Windows.

### Removed

- `jgengine upgrade` (with `--plan`, `--apply`, `--to`, `--json`), with no alias.

## Bends

- `upgrade.test.ts` and `upgradeCatalog.test.ts` are deleted. Their changelog tests moved to `releaseNotes.test.ts`; the catalog cases (bump, `--check`, `catalog:` kept, downgrade refused) are now sync tests.
- Sync always targets the CLI's own version (`npx jgengine@<version> sync` picks a version). The registry-publication check and the `--to` and `--json` flags from upgrade are dropped.
- The harness no longer runs a project's own `scripts/shoot.mjs`/`drive.mjs` copy, so `templates.test.ts` and `harness.test.ts` now expect no `scripts/` files and the bundled harness.
- The harness sources moved from `templates/gameFiles.ts` to `templates/harnessScripts.ts`; `check-scaffold-launch.ts` reads them there.
