# Unreleased changelog notes

A PR that changes published-SDK source (`packages/<pkg>/src`) adds one file here, named after its branch (`changes/<branch-name>.md`). `bun run lane:close -m "<what changed>"` writes it (`scripts/change-note.ts`): the `-m` lines under their headings (`Fixed: ...`, `Added: ...`, `Removed: ...`, `Migrate: ...`, else Changed), the exported API the diff added or removed, and for a game change its `Engine seam:` line. `bun run check changelog` requires it; `bun run release` folds every file into `CHANGELOG.md` `## [Unreleased]` and deletes them.

One file per PR means parallel PRs never conflict on `CHANGELOG.md`. Use the Keep a Changelog headings; lead with Migrate when a consumer has to change code:

```md
### Migrate

- `oldThing` is now `newThing`. Rename the call; arguments are unchanged.

### Added

- `createThing` (`@jgengine/core/thing`) does X.
```

Pure refactors, tests and internal-only changes skip it with `[skip changelog]` in a commit message.

The note is also the commit message and the PR body; lines before the first `###` (the summary, `Closes #N`, `Root cause:`, `Prevention:`, the seam) go to the commit and PR only. With no `-m` lines, `lane:close` writes the note from the branch's commit messages, bodies included.
