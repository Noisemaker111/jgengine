### Fixed

- A push to `beta` no longer cancels the previous beta run: `beta` serialises, so every push gets a finished verdict and a batch push is answered by the run it started. On 24 Oct 6 of 13 pushes to `beta` were cancelled, 122 runner-minutes were spent on runs killed mid-flight, and "is beta green" was answered by a run that never finished.
- `main` keeps its behaviour (never cancelled) and a pull request still cancels its own superseded run.
proof make this branch serialise like beta: temp config
