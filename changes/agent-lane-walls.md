### Changed

- A missing model or texture now names the file and the fix: `bun run games:provision` in the jgengine repo, or `npx assets pull <pack>` in your own game.
- Game assets live once per machine in a shared store (`.asset-store/` in the main checkout, `JG_ASSET_STORE` overrides); worktrees link to it and download nothing.
- CI never downloads models or boots games. `verify:fast` runs capabilities-sync and boot-probes the games a change reaches locally, prints each failing file's first error, and counts a file covered when its package's suite runs.
- `lane:close` adds a `## Bends` section to the PR body (loosened or deleted assertions, skipped tests, disabled checks, raised budgets), and `lane:audit` reads Claude Code transcripts as well as OpenCode sessions.
- `bun run release --wait` deploys jgengine.com from the released commit after the Publish run succeeds, on the releasing machine (the site build needs game models, which CI never touches); `bun run deploy:site` runs that deploy alone. A failed deploy fails the release with its reason.
