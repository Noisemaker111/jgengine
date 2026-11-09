Grass realism draws: finer, more numerous blades and natural shapes toward photoreal; fewer, wider, rounded blades toward cartoon

### Added

- Grass style `detail` (follows realism): up to six times the blades at 1 and half at 0, each narrower or wider by the same factor, so the ground a field covers holds. A bunchgrass puts the extra blades into its clumps; a sward spreads them over more tufts. Flowers per square metre hold at every detail
- Grass style `exaggeration` (follows 1 - realism): toward cartoon, even heights, deeper curls and round tips; toward natural, uneven heights and blades leaning every way, with mown blades getting torn, pale tips instead
- The turf under a grass patch follows `detail`: a flat painted colour at 0, its grain as before at 0.5, finer and stronger at 1
- A page's `?realism=` sets every grass patch's realism, so any scene can be shot or profiled at any realism (`--param realism=1`)
- `scrambledSobol2` (`@jgengine/core/random/scrambledSobol`): an even 2D spread where every prefix is even and none falls into rows

### Fixed

- A far grass field no longer draws faint rows like a planted crop: tuft roots follow a scrambled Sobol spread instead of R2, whose short prefixes (what a far field keeps) were a near-regular lattice
- Grass patches share one GPU copy of the blade template instead of uploading their own each, so walking into new grass costs less, most at realism 1
- Dev telemetry no longer turns off at random on a busy PC: the page waits 30 s, not 1.5 s, for the dev server's report route, and says so in its log when it gives up (perf records had come back without a frame breakdown)

### Changed

- A scene that sets no style draws the same grass as before, with tufts in new places (the placement fix above)
