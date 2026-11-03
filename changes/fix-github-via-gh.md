check capture-hygiene, which verify:fast runs, refuses tooling that reaches GitHub without gh

### Changed

- mirror-assets reads, creates and uploads to the packs release with gh api and gh release upload. pr-video reads the repository id with gh api; its attachment upload has no gh command and no API, so it keeps the browser upload flow. check scaffold-launch now fails on a GitHub API URL, SDK or token read in tooling outside the product packages, and on a landing script that builds its own gh call. release --wait merges its PR through the landing queue now that land labels instead of arming auto-merge.
- lane-close, land, land-batch, land-queue, ci-status and its --sweep all go through scripts/github.ts; the GraphQL-to-REST fallback switch (scripts/gh-rest.ts) is deleted.

### Fixed

- check capture-hygiene, which verify:fast runs, refuses tooling that reaches GitHub without gh
- mirror-assets and pr-video reach GitHub through gh, and a check refuses any other route
- the landing scripts reach GitHub one way, gh api REST, and the land:queue label replaces auto-merge
