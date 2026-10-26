The in-repo games' wiring files are now written by `jgengine sync` from the in-repo template instead of being hand-copied into each game, and the in-repo template now matches what the games actually run.

### Migrate

- `IN_REPO_TSCONFIG_PATHS` (`jgengine`) is gone, with `doctor`'s "in-repo tsconfig paths" finding: an in-repo game's `tsconfig.json` extends `games/tsconfig.base.json`, which takes the engine source paths from the repo's `tsconfig.base.json`.

### Changed

- The in-repo template (`jgengine create --in-repo`) writes the games' shared wiring: `vite.config.ts` on `games/shared` (`engineSource`, `viteProvisionAssets`, `viteIdleExit`; it used to import a `devSavePlugin` from `apps/dev` that no longer exists), a `tsconfig.json` that extends `../tsconfig.base.json`, an `index.css` that scans the engine's source (the games scanned `node_modules/@jgengine/*/dist`, which is not built in the repo), and a `main.tsx` that passes `gameId="<id>"`. It no longer writes `.gitignore` or `AGENTS.md`: an in-repo game has the monorepo's.
- Every in-repo game but llmville sets `"template": "3d"` in `jgengine.json`, so the `games-sync` gate keeps its wiring current. A game lists in `owns` the files that are really its own: a richer `index.html` (description, social tags), `index.tsx` with more entry exports (`editorCatalogs`, `uiScenario`), brightway-park's evidence plugin and ember-command's fixed port in `vite.config.ts`, and deepward's own entry. llmville keeps every file (no template).
- Games gained the template's `drive` and `shoot` scripts. drift-foundry's two page rules moved from `index.css` to `style.css`.

Verification:
- `bun packages/jgengine/src/cli/index.ts sync --check games/*`: every game up to date
- `bun scripts/check-types-all.ts`: 23 dirs, 0 failing
- `bun test packages/jgengine scripts/scaffold-editor.test.ts`: 387 pass
- fernwild and odd-orbit run from their own folder (`bun run dev`): styled title menu, fernwild's HUD and build strip in play

## Bends

- `templates.test.ts`: the "in-repo tsconfig paths match the exact map doctor requires" test went with the map; it is replaced by a test that the in-repo wiring extends the base tsconfig, runs on `games/shared` and names the game by id. The AGENTS.md test now runs on the standalone template only, since the in-repo template no longer writes one.
