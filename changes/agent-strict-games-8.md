### Changed

- llmville: the game package, Convex backend, dev-server bridges and scripts now pass the strict compiler flags (strict-flag errors 303 → 173; the rest are in `src/`).
- llmville: command and save readers use bracket reads, optional fields that can be unset say so with `| undefined`, and Convex calls only pass optional fields that are set.
