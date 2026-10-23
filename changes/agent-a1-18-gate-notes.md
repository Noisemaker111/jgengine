### Changed

- The CI gate runs nine test shards instead of ten, and a `types` job whose stages overlap, so a docs-only pull request fits the account's 20-job runner cap with room for another run beside it. `scripts/test-shard.ts` owns which files each shard runs and what it prepares first; `bun scripts/type-shard.ts` runs the `check-types` plan two stages at a time and then the tsc fan-out alone.
