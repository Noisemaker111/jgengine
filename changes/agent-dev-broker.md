### Fixed

- `assets pull` sends the GitHub token (`GITHUB_TOKEN`, `GH_TOKEN`, else the signed-in `gh` CLI's) to `api.github.com`, `raw.githubusercontent.com` and `codeload.github.com`, so parallel pulls on one machine no longer hit the anonymous 60-an-hour limit and fail with 403. Every pull request also has a hard budget (`JG_FETCH_TIMEOUT_MS`, 10 minutes) and fails naming the URL that stalled.
