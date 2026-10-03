### Fixed

- Node world-server shutdown now fences socket intake and ticks, drains accepted router work, and awaits the stopped host's final save. Repeated close calls share completion and persistence failure; interval-only `stop()` remains restartable.
