### Added

- `helpers.ensureJoined(ctx, { gameId, userId, serverId? })` (`@jgengine/convex/server`) joins a trusted actor through the `joinServer` path and returns its outcome, so host mutations can run commands for users with no live session. It is idempotent and pins no client session.
- `createTransportSessionId()` (`@jgengine/core/runtime/transport`) makes a fresh id for one client session's join/leave pair.

### Changed

- `GameRuntimeTransport.joinServer`/`leaveServer` take an optional `sessionId`. The Convex `joinServer`/`leaveServer` mutations and the WebSocket `join`/`leave` messages accept it (at most 128 characters). `useServerSession` and the shell's multiplayer sync send a fresh one per mount.
- Shared-topology `jgServerMembers` rows keep up to 16 live `sessionIds`. A leave with a `sessionId` ends only that session; the user leaves once none remain. A leave without one, or on a row without session ids, still leaves outright. Rooms topology is unchanged.
- The WebSocket router tracks sessions per connection and only leaves the host when no other connection of the same user holds the server.

### Fixed

- Closing a second tab, or a join that resolved after a remount, no longer evicts a user whose live tab still shows them joined, which made every later command fail with "Not a member of this server".
