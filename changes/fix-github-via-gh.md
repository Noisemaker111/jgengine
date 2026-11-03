Repo tooling reaches GitHub one way: gh, through gh api REST

### Changed

- lane-close, land, land-batch, land-queue, ci-status and its --sweep all go through scripts/github.ts, which runs every call as gh api REST, so they work the same on this PC and in cloud sessions. The land:queue label replaces auto-merge, and the GraphQL-to-REST fallback switch (scripts/gh-rest.ts) is deleted.
- release --wait merges its PR through the landing queue, since land now labels instead of arming auto-merge.
- mirror-assets reads, creates and uploads to the packs release with gh api and gh release upload. pr-video reads the repository id with gh api; its attachment upload has no gh command and no API, so it keeps the browser upload flow.

### Fixed

- check path-portability, which every verify:fast and CI run, fails on a GitHub API URL, SDK or token read in tooling outside the product packages, and on a landing script that builds its own gh call.
