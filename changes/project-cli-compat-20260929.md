### Fixed

- Created standalone projects pin the exact scaffolding CLI locally, independently of SDK dependency versions.
- Skill installs check the entire selected set before overwriting, preserve newer and unversioned differing copies unless `--force` is passed, and record portable CLI/SDK version metadata.
- Doctor reports when the running CLI targets an older SDK minor than the project's installed packages.
