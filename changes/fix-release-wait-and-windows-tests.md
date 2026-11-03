every package and game test script preloads three too, so bun --cwd=<folder> run test anywhere gets the same fix as the CLI suite

Root cause: Bun reads bunfig.toml only from the folder it starts in, so bun --cwd=<package> run test skipped the root three preload.

Engine seam: none - game content only

### Fixed

- every package and game test script preloads three too, so bun --cwd=<folder> run test anywhere gets the same fix as the CLI suite
- asset provisioning reads a game's editor scene like the site check does, so surfaces only the scene names (Brightway Park's and Ember Command's ground) are pulled before a site build
- package and game test scripts preload three like a root run does, so the CLI suite on Windows no longer fails with require() async module; two tests that load a lot cold get longer time limits
- release --wait reads main's CI run for the release commit, not beta's run of the same commit, and picks the newest run whatever order gh lists them

### Removed

- the preload in the other package and game test scripts; only the CLI suite runs from its own folder in CI, and a change reaching the games is blocked by Fernwild's depth gate on beta
