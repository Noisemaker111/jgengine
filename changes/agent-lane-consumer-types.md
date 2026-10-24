### Changed

- A release publishes only after `bun run check:consumer-types` packs the candidate, installs the tarballs into the pinned `JGengine-games` checkout and compiles every game; a type error names the game, package, file and line, and a run that could not check stops the release instead of passing.
