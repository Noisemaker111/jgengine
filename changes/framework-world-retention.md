### Added

- `WorldGameHost.unload(serverId)` explicitly saves and releases idle world references. It refuses players, spectators and resident members, retains a world after save failure, and reloads through the session factory on a later join.
