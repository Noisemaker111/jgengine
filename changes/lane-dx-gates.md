### Changed

- `publish.yml` starts when the release commit's CI finishes and refuses a commit CI has not passed, instead of re-running the full test suite on the release commit: one environment-sensitive test can no longer block a release whose PR was green (#2279). A release still builds, type-checks the packed SDK, checks for source artifacts, packs the candidate and compiles a real adopter against those tarballs.
- `bun scripts/check-release-ci.ts` reads the `ci.yml` verdict for one commit, so a manual publish answers the same question.

### Fixed

- `check:scaffold-launch` now fails on a second Chrome launch path: only `scripts/browser-lib.ts` and the scaffold template may name the debugger flag, and every capture script must reach the browser through `scripts/browser-lib.ts` (#2132).
