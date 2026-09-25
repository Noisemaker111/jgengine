### Added

- `CommandDef.access` (`@jgengine/core/runtime/commandRunner`). `"server"` marks a command whose input carries host-decided facts. The public Convex `runCommand` mutation and WebSocket client messages refuse it with `SERVER_ONLY_COMMAND_REASON`, while `helpers.runCommand` and `host.runCommand({ trusted: true })` still run it. `GameRuntime.commandAccess(name)` reports it.

### Changed

- `helpers.resetPlayerProfile` (`@jgengine/convex/server`) now resets a player who has left the server but still has a profile, instead of throwing, so scheduled wipes and insolvency resets no longer abort a whole batch. A user with neither membership nor a profile still throws.
