# Agent Notes — JGengine

Operational facts discovered the hard way. Update this when you learn something that would have saved time.

## Publishing

- **Use `npm publish --access public`, not `bun publish`.** `bun publish` does not read `~/.npmrc` auth tokens; it fails with "missing authentication" even when `NPM_TOKEN` is written to `.npmrc`.
- **The only `workspace:*` dep is in `packages/node` devDependencies** (`@jgengine/sql`). npm strips devDependencies before packing, so `npm publish` never sees it.
- **The publish workflow must trigger on its own file changes.** Include `.github/workflows/publish.yml` in the `on.push.paths` filter; otherwise fixing the pipeline requires a dummy change to package source.
- **Already-published versions are skipped** by the `npm view` guard, so re-pushing the workflow is safe.

## Skills

- **Skills are installed via `npx skills add Noisemaker111/jgengine`.**
- **Pushing to `main` does NOT auto-update existing skill installs.** Users must run `npx skills update` to pull descriptor/content changes.

## Environment

- **Lefthook is missing in this shell** but git commits still succeed; the warning is harmless.
