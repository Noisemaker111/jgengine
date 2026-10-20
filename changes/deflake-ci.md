### Fixed

- The bundled `jgengine drive` and `jgengine shoot` harnesses let Chrome pick a free debug port instead of guessing one from the clock, so they no longer attach to another Chrome that holds the same port. An interrupted drive or shoot (SIGINT/SIGTERM) now closes its Chrome instead of leaving it running.
