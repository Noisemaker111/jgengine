### Added

- `resolvePeerShellMultiplayer` can host a playable authoritative GameContext world with injected persistence, signaling, peers and tick scheduling; `close()` awaits its save boundary.
- `createWorldGameHost` supports a serialized `slotsPerServer` player cap while allowing existing members and spectators.
