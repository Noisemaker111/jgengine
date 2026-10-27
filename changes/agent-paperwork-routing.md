A new engine feature folder no longer needs a line in a hand-kept list. Which skill documents each `packages/core/src/<folder>/` is now written by `bun run gen` (run by `lane:close`) into `scripts/skill-routing.json`: a folder already there keeps its skill, a new folder takes the skill most of the folders it imports or that import it carry, and a removed folder leaves the file. The hand list in `scripts/skillRouting.ts` is gone.

### Changed

- Skill routing for core feature folders is generated (`bun run gen skill-routing`); adding a folder needs no hand edit.
