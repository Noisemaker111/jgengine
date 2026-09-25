# Unreleased changelog notes

A PR that changes published-SDK source (`packages/<pkg>/src`) adds one file here, named after its branch (`changes/<branch-name>.md`). `bun run check-changelog` requires it; `bun run release` folds every file into `CHANGELOG.md` `## [Unreleased]` and deletes them.

One file per PR means parallel PRs never conflict on `CHANGELOG.md`. Use the Keep a Changelog headings; lead with Migrate when a consumer has to change code:

```md
### Migrate

- `oldThing` is now `newThing`. Rename the call; arguments are unchanged.

### Added

- `createThing` (`@jgengine/core/thing`) does X.
```

Pure refactors, tests and internal-only changes skip it with `[skip changelog]` in a commit message.
