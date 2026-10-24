### Fixed

- A push to `beta` no longer cancels the run already in flight: `beta` serialises, so every verdict the branch reports was reached. On 24 Oct 11 of 44 pushes to `beta` were cancelled, 122 runner-minutes went on runs killed after they started, and "is beta green" was answered by a run that never finished.
- GitHub still keeps only the newest pending run when a burst arrives; what changes is that no beta run is killed once it starts.
- `main` is unchanged (never cancelled); a pull request still cancels its own superseded run.
